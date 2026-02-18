import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User
from app.schemas.membership import (
    MembershipCreate,
    MembershipResponse,
    MembershipUpdate,
    SwimAdjustRequest,
)
from app.services.auth_service import get_current_user
from app.services.membership_service import (
    adjust_swims,
    create_membership,
    update_membership,
)

router = APIRouter()


@router.post("", response_model=MembershipResponse, status_code=201)
def create_membership_endpoint(
    data: MembershipCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    membership = create_membership(db, data.member_id, data.plan_id)
    return _to_response(membership)


@router.put("/{membership_id}", response_model=MembershipResponse)
def update_membership_endpoint(
    membership_id: uuid.UUID,
    data: MembershipUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    membership = update_membership(db, membership_id, data.model_dump(exclude_unset=True), user_id=current_user.id)
    return _to_response(membership)


@router.post("/{membership_id}/adjust", response_model=MembershipResponse)
def adjust_swims_endpoint(
    membership_id: uuid.UUID,
    data: SwimAdjustRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    membership = adjust_swims(db, membership_id, data.adjustment, data.notes, user_id=current_user.id)
    return _to_response(membership)


def _to_response(membership) -> MembershipResponse:
    return MembershipResponse(
        id=membership.id,
        member_id=membership.member_id,
        plan_id=membership.plan_id,
        plan_type=membership.plan_type,
        swims_total=membership.swims_total,
        swims_used=membership.swims_used,
        valid_from=membership.valid_from,
        valid_until=membership.valid_until,
        is_active=membership.is_active,
        created_at=membership.created_at,
        plan_name=membership.plan.name if membership.plan else None,
    )
