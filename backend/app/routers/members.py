import logging
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

from app.database import get_db
from app.models.activity_log import ActivityLog
from app.models.checkin import Checkin
from app.models.membership import Membership
from app.models.plan import Plan
from app.models.saved_card import SavedCard
from app.models.user import User
from app.schemas.member import (
    CreditAdjustRequest,
    MemberCreate,
    MemberListResponse,
    MemberResponse,
    MemberUpdate,
)
from app.services.auth_service import get_current_user
from app.services.member_service import (
    adjust_credit,
    create_member,
    deactivate_member,
    get_member,
    list_members,
    update_member,
)

router = APIRouter()


@router.get("", response_model=MemberListResponse)
def list_members_endpoint(
    search: str | None = None,
    is_active: bool | None = None,
    page: int = Query(1, ge=1),
    per_page: int = Query(25, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    items, total = list_members(db, search=search, is_active=is_active, page=page, per_page=per_page)
    return MemberListResponse(items=items, total=total, page=page, per_page=per_page)


@router.post("", response_model=MemberResponse, status_code=201)
def create_member_endpoint(
    data: MemberCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return create_member(db, data)


@router.get("/{member_id}", response_model=MemberResponse)
def get_member_endpoint(
    member_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return get_member(db, member_id)


@router.put("/{member_id}", response_model=MemberResponse)
def update_member_endpoint(
    member_id: uuid.UUID,
    data: MemberUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return update_member(db, member_id, data, user_id=current_user.id)


@router.delete("/{member_id}", response_model=MemberResponse)
def deactivate_member_endpoint(
    member_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return deactivate_member(db, member_id, user_id=current_user.id)


@router.get("/{member_id}/history")
def get_member_history(
    member_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Get activity log entries
    activity_entries = (
        db.query(ActivityLog)
        .filter(ActivityLog.entity_id == member_id)
        .order_by(ActivityLog.created_at.desc())
        .limit(100)
        .all()
    )

    # Get check-in records
    checkin_entries = (
        db.query(Checkin)
        .filter(Checkin.member_id == member_id)
        .order_by(Checkin.checked_in_at.desc())
        .limit(100)
        .all()
    )

    # Merge and format results
    results = []

    for e in activity_entries:
        results.append({
            "id": str(e.id),
            "action_type": e.action_type,
            "entity_type": e.entity_type,
            "before_value": e.before_value,
            "after_value": e.after_value,
            "note": e.note,
            "created_at": e.created_at.isoformat(),
        })

    for c in checkin_entries:
        results.append({
            "id": str(c.id),
            "action_type": "checkin",
            "entity_type": "checkin",
            "before_value": None,
            "after_value": {
                "checkin_type": c.checkin_type.value,
                "guest_count": c.guest_count,
            },
            "note": c.notes or f"Checked in ({c.checkin_type.value.replace('_', ' ')})" + (f" with {c.guest_count} guest(s)" if c.guest_count > 0 else ""),
            "created_at": c.checked_in_at.isoformat(),
        })

    # Sort by created_at descending
    results.sort(key=lambda x: x["created_at"], reverse=True)

    return results[:100]


@router.post("/{member_id}/credit", response_model=MemberResponse)
def adjust_credit_endpoint(
    member_id: uuid.UUID,
    data: CreditAdjustRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return adjust_credit(db, member_id, data, user_id=current_user.id)


@router.get("/{member_id}/memberships")
def get_member_memberships(
    member_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    memberships = (
        db.query(Membership)
        .filter(Membership.member_id == member_id)
        .order_by(Membership.created_at.desc())
        .all()
    )
    result = []
    for m in memberships:
        plan_name = m.plan.name if m.plan else None
        swims_remaining = None
        if m.swims_total is not None:
            swims_remaining = (m.swims_total or 0) - (m.swims_used or 0)
        result.append({
            "id": str(m.id),
            "plan_id": str(m.plan_id) if m.plan_id else None,
            "plan_name": plan_name,
            "plan_type": m.plan_type.value,
            "swims_total": m.swims_total,
            "swims_used": m.swims_used,
            "swims_remaining": swims_remaining,
            "valid_from": str(m.valid_from) if m.valid_from else None,
            "valid_until": str(m.valid_until) if m.valid_until else None,
            "is_active": m.is_active,
            "created_at": m.created_at.isoformat(),
        })
    return result


@router.get("/{member_id}/saved-cards")
def get_member_saved_cards(
    member_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    cards = db.query(SavedCard).filter(SavedCard.member_id == member_id).all()
    result = []
    for c in cards:
        plan_name = None
        if c.auto_charge_plan_id:
            plan = db.query(Plan).filter(Plan.id == c.auto_charge_plan_id).first()
            plan_name = plan.name if plan else None
        result.append({
            "id": str(c.id),
            "card_last4": c.card_last4,
            "card_brand": c.card_brand,
            "friendly_name": c.friendly_name,
            "is_default": c.is_default,
            "auto_charge_enabled": c.auto_charge_enabled,
            "auto_charge_plan_name": plan_name,
            "next_charge_date": str(c.next_charge_date) if c.next_charge_date else None,
            "created_at": c.created_at.isoformat(),
        })
    return result


@router.delete("/{member_id}/saved-cards/{card_id}")
def delete_member_saved_card(
    member_id: uuid.UUID,
    card_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    card = db.query(SavedCard).filter(SavedCard.id == card_id, SavedCard.member_id == member_id).first()
    if not card:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Saved card not found")
    db.delete(card)
    db.commit()
    return {"message": "Saved card removed"}
