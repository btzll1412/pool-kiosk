import uuid
from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel

from app.models.plan import PlanType


class PaymentInfo(BaseModel):
    """Payment information for membership creation."""
    payment_method: str  # "cash" or "card"
    amount_tendered: Decimal | None = None  # For cash payments
    saved_card_id: uuid.UUID | None = None  # Use existing saved card
    card_last4: str | None = None  # For new card tokenization
    card_brand: str | None = None  # For new card tokenization
    save_card: bool = False  # Save the new card for future use
    enable_autopay: bool = False  # Enable auto-charge for monthly plans


class MembershipCreate(BaseModel):
    member_id: uuid.UUID
    plan_id: uuid.UUID
    payment: PaymentInfo | None = None  # Optional payment processing


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


class MembershipCreateWithPaymentResponse(BaseModel):
    """Response for membership creation with optional payment."""
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
    transaction_id: uuid.UUID | None = None
    saved_card_id: uuid.UUID | None = None
    message: str | None = None

    model_config = {"from_attributes": True}


class SavedCardCreate(BaseModel):
    """Request to add a saved card for a member."""
    card_last4: str
    card_brand: str
    friendly_name: str | None = None


class SavedCardResponse(BaseModel):
    """Response for saved card creation."""
    id: uuid.UUID
    card_last4: str
    card_brand: str | None
    friendly_name: str | None
    is_default: bool
    created_at: datetime

    model_config = {"from_attributes": True}
