import logging
import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

from app.database import get_db
from app.models.member import Member
from app.models.membership import Membership
from app.models.plan import Plan
from app.models.user import User
from app.schemas.plan import PlanCreate, PlanResponse, PlanUpdate
from app.services.activity_service import log_activity
from app.services.auth_service import get_current_user
from app.services.report_service import is_membership_usable

router = APIRouter()


@router.get("")
def list_plans(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    plans = db.query(Plan).order_by(Plan.display_order, Plan.name).all()
    result = []
    for plan in plans:
        # Count only truly usable memberships (not expired, has remaining swims)
        all_memberships = (
            db.query(Membership)
            .filter(Membership.plan_id == plan.id, Membership.is_active.is_(True))
            .all()
        )
        active_subscribers = sum(1 for m in all_memberships if is_membership_usable(m))
        result.append({
            "id": str(plan.id),
            "name": plan.name,
            "plan_type": plan.plan_type.value,
            "price": str(plan.price),
            "swim_count": plan.swim_count,
            "duration_days": plan.duration_days,
            "duration_months": plan.duration_months,
            "display_order": plan.display_order,
            "is_active": plan.is_active,
            "is_senior_plan": plan.is_senior_plan,
            "created_at": plan.created_at.isoformat() if plan.created_at else None,
            "active_subscribers": active_subscribers,
        })
    return result


@router.post("", response_model=PlanResponse, status_code=201)
def create_plan(
    data: PlanCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    plan = Plan(**data.model_dump())
    db.add(plan)
    db.commit()
    db.refresh(plan)
    log_activity(db, user_id=current_user.id, action="plan.create", entity_type="plan", entity_id=plan.id, after=data.model_dump(mode="json"))
    return plan


@router.put("/{plan_id}", response_model=PlanResponse)
def update_plan(
    plan_id: uuid.UUID,
    data: PlanUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    plan = db.query(Plan).filter(Plan.id == plan_id).first()
    if not plan:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Plan not found")
    before = {"name": plan.name, "price": str(plan.price), "is_active": plan.is_active}
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(plan, field, value)
    db.commit()
    db.refresh(plan)
    after = {"name": plan.name, "price": str(plan.price), "is_active": plan.is_active}
    log_activity(db, user_id=current_user.id, action="plan.update", entity_type="plan", entity_id=plan.id, before=before, after=after)
    return plan


@router.delete("/{plan_id}", response_model=PlanResponse)
def deactivate_plan(
    plan_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    plan = db.query(Plan).filter(Plan.id == plan_id).first()
    if not plan:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Plan not found")
    plan.is_active = False
    db.commit()
    db.refresh(plan)
    log_activity(db, user_id=current_user.id, action="plan.deactivate", entity_type="plan", entity_id=plan.id)
    return plan


@router.get("/{plan_id}/subscribers")
def get_plan_subscribers(
    plan_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get all active subscribers for a plan."""
    plan = db.query(Plan).filter(Plan.id == plan_id).first()
    if not plan:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Plan not found")

    # Get all active memberships for this plan
    memberships = (
        db.query(Membership)
        .filter(Membership.plan_id == plan_id, Membership.is_active.is_(True))
        .all()
    )

    # Filter to only usable memberships and get member details
    subscribers = []
    for m in memberships:
        if is_membership_usable(m):
            member = db.query(Member).filter(Member.id == m.member_id).first()
            if member:
                subscribers.append({
                    "member_id": str(member.id),
                    "first_name": member.first_name,
                    "last_name": member.last_name,
                    "phone": member.phone,
                    "membership_id": str(m.id),
                    "valid_until": m.valid_until.isoformat() if m.valid_until else None,
                    "swims_remaining": (m.swims_total - m.swims_used) if m.swims_total else None,
                })

    return {
        "plan_id": str(plan_id),
        "plan_name": plan.name,
        "subscribers": subscribers,
    }
