import uuid
from datetime import date, datetime

from pydantic import BaseModel

from app.models.plan import PlanType


class MembershipCreate(BaseModel):
    member_id: uuid.UUID
    plan_id: uuid.UUID


class MembershipUpdate(BaseModel):
    swims_total: int | None = None
    swims_used: int | None = None
    valid_from: date | None = None
    valid_until: date | None = None
    is_active: bool | None = None


class MembershipResponse(BaseModel):
    id: uuid.UUID
    member_id: uuid.UUID
    plan_id: uuid.UUID
    plan_type: PlanType
    swims_total: int | None
    swims_used: int | None
    valid_from: date | None
    valid_until: date | None
    is_active: bool
    created_at: datetime
    plan_name: str | None = None

    model_config = {"from_attributes": True}


class SwimAdjustRequest(BaseModel):
    adjustment: int
    notes: str | None = None


class FreezeRequest(BaseModel):
    freeze_days: int | None = None
    freeze_end: date | None = None
    reason: str | None = None


class UnfreezeRequest(BaseModel):
    member_id: uuid.UUID
    pin: str
