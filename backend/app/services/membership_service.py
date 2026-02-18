import uuid
from datetime import date, timedelta

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.membership import Membership
from app.models.membership_freeze import MembershipFreeze
from app.models.plan import Plan, PlanType
from app.services.activity_service import log_activity


def create_membership(db: Session, member_id: uuid.UUID, plan_id: uuid.UUID) -> Membership:
    plan = db.query(Plan).filter(Plan.id == plan_id).first()
    if not plan:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Plan not found")

    today = date.today()
    membership = Membership(
        member_id=member_id,
        plan_id=plan.id,
        plan_type=plan.plan_type,
    )

    if plan.plan_type == PlanType.swim_pass:
        membership.swims_total = plan.swim_count
        membership.swims_used = 0
    elif plan.plan_type == PlanType.monthly:
        membership.valid_from = today
        membership.valid_until = today + timedelta(days=plan.duration_days or 30)
    elif plan.plan_type == PlanType.single:
        membership.swims_total = 1
        membership.swims_used = 0

    db.add(membership)
    db.commit()
    db.refresh(membership)
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

    today = date.today()
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
    if freeze:
        freeze.freeze_end = date.today()

    membership = db.query(Membership).filter(Membership.id == membership_id).first()
    if not membership:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Membership not found")

    db.commit()
    db.refresh(membership)
    log_activity(db, user_id=user_id, action="membership.unfreeze", entity_type="membership", entity_id=membership_id)
    return membership
