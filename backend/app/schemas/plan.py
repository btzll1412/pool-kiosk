import uuid
from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel

from app.models.plan import PlanType


class PlanCreate(BaseModel):
    name: str
    plan_type: PlanType
    price: Decimal
    swim_count: int | None = None
    duration_days: int | None = None
    duration_months: int | None = None
    is_active: bool = True
    display_order: int = 0
    is_senior_plan: bool = False


class PlanUpdate(BaseModel):
    name: str | None = None
    plan_type: PlanType | None = None
    price: Decimal | None = None
    swim_count: int | None = None
    duration_days: int | None = None
    duration_months: int | None = None
    is_active: bool | None = None
    display_order: int | None = None
    is_senior_plan: bool | None = None


class PlanResponse(BaseModel):
    id: uuid.UUID
    name: str
    plan_type: PlanType
    price: Decimal
    swim_count: int | None
    duration_days: int | None
    duration_months: int | None
    is_active: bool
    display_order: int
    is_senior_plan: bool
    created_at: datetime

    model_config = {"from_attributes": True}
