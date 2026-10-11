"""Swipe log: every kiosk card read or member lookup, and what came of it."""
import logging
import uuid
from datetime import datetime, timedelta

from sqlalchemy.orm import Session

from app.models.checkin import Checkin
from app.models.member import Member
from app.models.membership import Membership
from app.models.swipe import Swipe, SwipeOutcome, SwipeSource

logger = logging.getLogger(__name__)

# A check-in (or failed attempt) this soon after a swipe belongs to that swipe
LINK_WINDOW = timedelta(minutes=15)


def record_swipe(
    db: Session,
    outcome: SwipeOutcome,
    member: Member | None = None,
    card_uid: str | None = None,
    source: SwipeSource = SwipeSource.card,
) -> Swipe:
    swipe = Swipe(
        member_id=member.id if member else None,
        card_uid=card_uid,
        source=source,
        outcome=outcome,
    )
    db.add(swipe)
    db.commit()
    logger.info("Swipe recorded: outcome=%s, member=%s, card=%s, source=%s",
                outcome.value, swipe.member_id, card_uid, source.value)
    return swipe


def outcome_for_member(db: Session, member: Member, has_usable_plan: bool, is_frozen: bool) -> SwipeOutcome:
    """Classify a recognised member at the moment they present themselves."""
    if member.is_unlimited or has_usable_plan:
        return SwipeOutcome.no_action  # upgraded to checked_in if they check in
    if is_frozen:
        return SwipeOutcome.frozen
    ever_had_plan = db.query(Membership.id).filter(Membership.member_id == member.id).first() is not None
    return SwipeOutcome.expired if ever_had_plan else SwipeOutcome.no_plan


def _latest_open_swipe(db: Session, member_id: uuid.UUID) -> Swipe | None:
    since = datetime.utcnow() - LINK_WINDOW
    return (
        db.query(Swipe)
        .filter(
            Swipe.member_id == member_id,
            Swipe.created_at >= since,
            Swipe.checkin_id.is_(None),
            Swipe.outcome != SwipeOutcome.checked_in,
        )
        .order_by(Swipe.created_at.desc())
        .first()
    )


def mark_checked_in(db: Session, checkin: Checkin) -> Swipe:
    """Link a successful check-in to the swipe that led to it (or record one if none)."""
    swipe = _latest_open_swipe(db, checkin.member_id)
    if swipe is None:
        swipe = Swipe(member_id=checkin.member_id, source=SwipeSource.card, outcome=SwipeOutcome.checked_in)
        db.add(swipe)
    swipe.outcome = SwipeOutcome.checked_in
    swipe.checkin_id = checkin.id
    db.commit()
    return swipe


def mark_checkin_failed(db: Session, member_id: uuid.UUID, outcome: SwipeOutcome) -> None:
    """A check-in attempt was refused — record why on the swipe."""
    swipe = _latest_open_swipe(db, member_id)
    if swipe is None:
        swipe = Swipe(member_id=member_id, source=SwipeSource.card, outcome=outcome)
        db.add(swipe)
    else:
        swipe.outcome = outcome
    db.commit()
