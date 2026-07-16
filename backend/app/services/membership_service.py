import logging
import uuid
from datetime import date, datetime, timedelta
from calendar import monthrange

import pytz
from fastapi import HTTPException, status
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

from app.models.membership import Membership
from app.models.membership_freeze import MembershipFreeze
from app.models.plan import Plan, PlanType
from app.services.activity_service import log_activity
from app.services.settings_service import get_setting


def _get_local_today(db: Session) -> date:
    """Get today's date in the configured local timezone."""
    tz_name = get_setting(db, "timezone", "America/New_York")
    try:
        local_tz = pytz.timezone(tz_name)
    except pytz.UnknownTimeZoneError:
        local_tz = pytz.timezone("America/New_York")
    return datetime.now(local_tz).date()


def create_membership(db: Session, member_id: uuid.UUID, plan_id: uuid.UUID, start_date: date = None, billing_day: int = None) -> Membership:
    plan = db.query(Plan).filter(Plan.id == plan_id).first()
    if not plan:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Plan not found")

    today = _get_local_today(db)

    # For swim passes, stack onto existing active membership if one exists
    if plan.plan_type == PlanType.swim_pass:
        existing = (
            db.query(Membership)
            .filter(
                Membership.member_id == member_id,
                Membership.plan_type == PlanType.swim_pass,
                Membership.is_active.is_(True),
            )
            .first()
        )
        if existing:
            # Check if there are remaining swims
            remaining = (existing.swims_total or 0) - existing.swims_used
            if remaining > 0:
                # Add new swims to existing balance
                existing.swims_total = (existing.swims_total or 0) + plan.swim_count
                db.flush()  # Flush but don't commit - let caller control transaction
                logger.info(
                    "Swim pass stacked: member=%s, plan=%s, added=%d swims, new_total=%d, membership=%s",
                    member_id, plan.name, plan.swim_count, existing.swims_total, existing.id
                )
                return existing

    # Prevent multiple active monthly memberships
    if plan.plan_type == PlanType.monthly:
        existing_monthly = (
            db.query(Membership)
            .filter(
                Membership.member_id == member_id,
                Membership.plan_type == PlanType.monthly,
                Membership.is_active.is_(True),
            )
            .first()
        )
        if existing_monthly:
            # Deactivate the old monthly membership before creating a new one
            existing_monthly.is_active = False
            db.flush()
            logger.info("Deactivated existing monthly membership %s before creating new one for member %s",
                       existing_monthly.id, member_id)

    membership = Membership(
        member_id=member_id,
        plan_id=plan.id,
        plan_type=plan.plan_type,
    )

    if plan.plan_type == PlanType.swim_pass:
        membership.swims_total = plan.swim_count
        membership.swims_used = 0
    elif plan.plan_type == PlanType.monthly:
        effective_start = start_date or today
        membership.valid_from = effective_start
        duration_months = plan.duration_months or 1

        # Calculate valid_until based on start date + duration months
        # Use billing_day to align expiry (default: same day of month as start)
        anchor_day = billing_day or effective_start.day
        # Clamp to 28 to avoid issues with short months
        anchor_day = min(anchor_day, 28)

        year = effective_start.year
        month = effective_start.month + duration_months
        while month > 12:
            month -= 12
            year += 1
        # Safety: clamp to actual last day of target month
        last_day = monthrange(year, month)[1]
        membership.valid_until = date(year, month, min(anchor_day, last_day))

        # Next billing date = expiry date (so charge and renewal are in sync)
        membership.next_billing_date = membership.valid_until
    elif plan.plan_type == PlanType.single:
        membership.swims_total = 1
        membership.swims_used = 0

    db.add(membership)
    db.flush()  # Flush to get ID but don't commit - let caller control transaction
    logger.info("Membership created: member=%s, plan=%s, type=%s, membership=%s", member_id, plan.name, plan.plan_type.value, membership.id)
    return membership


def update_membership(
    db: Session, membership_id: uuid.UUID, data: dict, user_id: uuid.UUID | None = None
) -> Membership:
    membership = db.query(Membership).filter(Membership.id == membership_id).first()
    if not membership:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Membership not found")

    before = {
        "swims_total": membership.swims_total,
        "swims_used": membership.swims_used,
        "valid_from": str(membership.valid_from) if membership.valid_from else None,
        "valid_until": str(membership.valid_until) if membership.valid_until else None,
        "is_active": membership.is_active,
    }

    for field, value in data.items():
        if hasattr(membership, field):
            setattr(membership, field, value)

    db.commit()
    db.refresh(membership)

    after = {
        "swims_total": membership.swims_total,
        "swims_used": membership.swims_used,
        "valid_from": str(membership.valid_from) if membership.valid_from else None,
        "valid_until": str(membership.valid_until) if membership.valid_until else None,
        "is_active": membership.is_active,
    }
    log_activity(db, user_id=user_id, action="membership.update", entity_type="membership", entity_id=membership.id, before=before, after=after)
    logger.info("Membership updated: membership=%s, by_user=%s", membership_id, user_id)
    return membership


def adjust_swims(
    db: Session, membership_id: uuid.UUID, adjustment: int, notes: str | None = None, user_id: uuid.UUID | None = None
) -> Membership:
    membership = db.query(Membership).filter(Membership.id == membership_id).first()
    if not membership:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Membership not found")
    if membership.plan_type != PlanType.swim_pass:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Can only adjust swims for swim pass memberships")

    before_used = membership.swims_used
    membership.swims_used = max(0, membership.swims_used - adjustment)
    db.commit()
    db.refresh(membership)

    log_activity(
        db, user_id=user_id, action="membership.swim_adjust", entity_type="membership",
        entity_id=membership.id,
        before={"swims_used": before_used},
        after={"swims_used": membership.swims_used},
        note=notes,
    )
    logger.info("Swims adjusted: membership=%s, before=%d, after=%d, by_user=%s", membership_id, before_used, membership.swims_used, user_id)
    return membership


def freeze_membership(
    db: Session, membership_id: uuid.UUID, freeze_days: int | None = None,
    freeze_end: date | None = None, reason: str | None = None,
    user_id: uuid.UUID | None = None,
) -> MembershipFreeze:
    membership = db.query(Membership).filter(Membership.id == membership_id, Membership.is_active.is_(True)).first()
    if not membership:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Active membership not found")

    active_freeze = (
        db.query(MembershipFreeze)
        .filter(MembershipFreeze.membership_id == membership_id, MembershipFreeze.freeze_end.is_(None))
        .first()
    )
    if active_freeze:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Membership is already frozen")

    today = _get_local_today(db)
    if freeze_end:
        days = (freeze_end - today).days
    elif freeze_days:
        days = freeze_days
        freeze_end = today + timedelta(days=freeze_days)
    else:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Provide freeze_days or freeze_end")

    freeze = MembershipFreeze(
        membership_id=membership_id,
        frozen_by=user_id,
        freeze_start=today,
        freeze_end=freeze_end,
        days_extended=days,
        reason=reason,
    )

    if membership.valid_until:
        membership.valid_until += timedelta(days=days)

    db.add(freeze)
    db.commit()
    db.refresh(freeze)
    log_activity(db, user_id=user_id, action="membership.freeze", entity_type="membership", entity_id=membership_id, after={"freeze_end": str(freeze_end), "days_extended": days})
    logger.info("Membership frozen: membership=%s, until=%s, days=%d", membership_id, freeze_end, days)
    return freeze


def unfreeze_membership(db: Session, membership_id: uuid.UUID, user_id: uuid.UUID | None = None) -> Membership:
    freeze = (
        db.query(MembershipFreeze)
        .filter(MembershipFreeze.membership_id == membership_id, MembershipFreeze.freeze_end.is_(None))
        .first()
    )
    if not freeze:
        freeze = (
            db.query(MembershipFreeze)
            .filter(MembershipFreeze.membership_id == membership_id)
            .order_by(MembershipFreeze.created_at.desc())
            .first()
        )

    membership = db.query(Membership).filter(Membership.id == membership_id).first()
    if not membership:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Membership not found")

    if freeze:
        today = _get_local_today(db)
        freeze.freeze_end = today
        # Subtract unused freeze days from valid_until so member doesn't get free extension
        if freeze.days_extended and membership.valid_until and freeze.freeze_start:
            original_freeze_end = freeze.freeze_start + timedelta(days=freeze.days_extended)
            unused_days = (original_freeze_end - today).days
            if unused_days > 0:
                membership.valid_until -= timedelta(days=unused_days)
                logger.info("Unfreeze: removed %d unused freeze days from membership %s", unused_days, membership_id)

    db.commit()
    db.refresh(membership)
    log_activity(db, user_id=user_id, action="membership.unfreeze", entity_type="membership", entity_id=membership_id)
    logger.info("Membership unfrozen: membership=%s", membership_id)
    return membership
