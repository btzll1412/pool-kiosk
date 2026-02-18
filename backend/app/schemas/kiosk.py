import uuid
from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel

from app.models.checkin import CheckinType
from app.models.plan import PlanType
from app.models.transaction import PaymentMethod


class ScanRequest(BaseModel):
    rfid_uid: str


class SearchRequest(BaseModel):
    query: str


class MemberStatus(BaseModel):
    member_id: uuid.UUID
    first_name: str
    last_name: str
    credit_balance: Decimal
    has_pin: bool
    active_membership: "ActiveMembershipInfo | None" = None
    is_frozen: bool = False
    frozen_until: date | None = None


class ActiveMembershipInfo(BaseModel):
    membership_id: uuid.UUID
    plan_name: str
    plan_type: PlanType
    swims_remaining: int | None = None
    valid_until: date | None = None


class KioskCheckinRequest(BaseModel):
    member_id: uuid.UUID
    guest_count: int = 0


class KioskCheckinResponse(BaseModel):
    checkin_id: uuid.UUID
    checkin_type: CheckinType
    guest_count: int
    message: str


class CashPaymentRequest(BaseModel):
    member_id: uuid.UUID
    plan_id: uuid.UUID
    amount_tendered: Decimal
    pin: str
    wants_change: bool = False


class CardPaymentRequest(BaseModel):
    member_id: uuid.UUID
    plan_id: uuid.UUID
    saved_card_id: uuid.UUID | None = None
    pin: str
    save_card: bool = False
    card_last4: str | None = None
    card_brand: str | None = None
    friendly_name: str | None = None


class SplitPaymentRequest(BaseModel):
    member_id: uuid.UUID
    plan_id: uuid.UUID
    cash_amount: Decimal
    pin: str
    saved_card_id: uuid.UUID | None = None


class PaymentResponse(BaseModel):
    success: bool
    transaction_id: uuid.UUID | None = None
    membership_id: uuid.UUID | None = None
    change_due: Decimal = Decimal("0.00")
    credit_added: Decimal = Decimal("0.00")
    message: str


class GuestVisitRequest(BaseModel):
    name: str
    phone: str | None = None
    payment_method: PaymentMethod
    plan_id: uuid.UUID


class GuestVisitResponse(BaseModel):
    visit_id: uuid.UUID
    amount_paid: Decimal
    message: str


class SavedCardRequest(BaseModel):
    processor_token: str
    card_last4: str
    card_brand: str | None = None
    friendly_name: str | None = None


class SavedCardResponse(BaseModel):
    id: uuid.UUID
    card_last4: str
    card_brand: str | None
    friendly_name: str | None
    is_default: bool

    model_config = {"from_attributes": True}


class SavedCardDetailResponse(BaseModel):
    id: uuid.UUID
    card_last4: str
    card_brand: str | None
    friendly_name: str | None
    is_default: bool
    auto_charge_enabled: bool
    auto_charge_plan_name: str | None = None
    next_charge_date: date | None = None

    model_config = {"from_attributes": True}


class SavedCardUpdateRequest(BaseModel):
    friendly_name: str


class TokenizeCardRequest(BaseModel):
    card_last4: str
    card_brand: str | None = None
    friendly_name: str | None = None
    member_id: uuid.UUID
    pin: str


class AutoChargeRequest(BaseModel):
    plan_id: uuid.UUID
    member_id: uuid.UUID
    pin: str


class AutoChargeDisableRequest(BaseModel):
    member_id: uuid.UUID
    pin: str


class SetDefaultCardRequest(BaseModel):
    member_id: uuid.UUID
    pin: str


class PinVerifyRequest(BaseModel):
    member_id: uuid.UUID
    pin: str


class KioskFreezeRequest(BaseModel):
    member_id: uuid.UUID
    freeze_days: int | None = None
    freeze_end: date | None = None
    pin: str


class KioskUnfreezeRequest(BaseModel):
    member_id: uuid.UUID
    pin: str
