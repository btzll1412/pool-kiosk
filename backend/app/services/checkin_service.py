import uuid
from datetime import date, datetime

from fastapi import HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.checkin import Checkin, CheckinType
from app.models.member import Member
from app.models.membership import Membership
from app.models.plan import PlanType
from app.services.settings_service import get_setting


def perform_checkin(
    db: Session,
    member_id: uuid.UUID,
    guest_count: int = 0,
) -> Checkin:
    member = db.query(Member).filter(Member.id == member_id, Member.is_active.is_(True)).first()
    if not member:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Member not found or inactive")

    membership = _get_active_membership(db, member_id)

    if membership:
        checkin_type, deducted = _process_membership_checkin(db, membership, guest_count)
    else:
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail="No active membership. Please purchase a plan.",
        )

    checkin = Checkin(
        member_id=member_id,
        membership_id=membership.id if membership else None,
        checkin_type=checkin_type,
        guest_count=guest_count,
    )
    db.add(checkin)
    db.commit()
    db.refresh(checkin)
    return checkin


def _get_active_membership(db: Session, member_id: uuid.UUID) -> Membership | None:
    today = date.today()
    memberships = (
        db.query(Membership)
        .filter(
            Membership.member_id == member_id,
            Membership.is_active.is_(True),
        )
        .all()
    )
    for m in memberships:
        if m.plan_type == PlanType.monthly:
            if m.valid_from and m.valid_until and m.valid_from <= today <= m.valid_until:
                return m
        elif m.plan_type == PlanType.swim_pass:
            if m.swims_total and m.swims_used < m.swims_total:
                return m
    return None


def _process_membership_checkin(
    db: Session, membership: Membership, guest_count: int
) -> tuple[CheckinType, int]:
    total_swims = 1 + guest_count

    if membership.plan_type == PlanType.monthly:
        return CheckinType.membership, 0

    if membership.plan_type == PlanType.swim_pass:
        remaining = (membership.swims_total or 0) - membership.swims_used
        if remaining < total_swims:
            raise HTTPException(
                status_code=status.HTTP_402_PAYMENT_REQUIRED,
                detail=f"Not enough swims remaining. Need {total_swims}, have {remaining}.",
            )
        membership.swims_used += total_swims
        return CheckinType.swim_pass, total_swims

    return CheckinType.membership, 0
