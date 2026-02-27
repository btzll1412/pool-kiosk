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
    phone: str | None = None
    email: str | None = None
    gender: str | None = None
    credit_balance: Decimal
    has_pin: bool
    date_of_birth: date | None = None
    is_senior: bool = False
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
    use_credit: bool = False


class CardPaymentRequest(BaseModel):
    member_id: uuid.UUID
    plan_id: uuid.UUID
    saved_card_id: uuid.UUID | None = None
    pin: str
    save_card: bool = False
    card_last4: str | None = None
    card_brand: str | None = None
    friendly_name: str | None = None
    use_credit: bool = False


class SplitPaymentRequest(BaseModel):
    member_id: uuid.UUID
    plan_id: uuid.UUID
    cash_amount: Decimal
    pin: str
    saved_card_id: uuid.UUID | None = None


class CreditPaymentRequest(BaseModel):
    member_id: uuid.UUID
    plan_id: uuid.UUID
    pin: str


class PaymentResponse(BaseModel):
    success: bool
    transaction_id: uuid.UUID | None = None
    membership_id: uuid.UUID | None = None
    change_due: Decimal = Decimal("0.00")
    credit_added: Decimal = Decimal("0.00")
    credit_used: Decimal = Decimal("0.00")
    remaining_due: Decimal = Decimal("0.00")
    message: str


class GuestVisitRequest(BaseModel):
    name: str
    phone: str
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


class TokenizeTrackDataRequest(BaseModel):
    """Request to tokenize card from magnetic stripe track data."""
    track_data: str  # Raw track data from card reader
    friendly_name: str | None = None
    member_id: uuid.UUID
    pin: str | None = None  # Optional for kiosk, not required for admin


class TokenizeFullCardRequest(BaseModel):
    """Request to tokenize card from full card details (via hosted payment callback)."""
    card_number: str
    exp_date: str  # MMYY format
    friendly_name: str | None = None
    member_id: uuid.UUID
    pin: str | None = None  # Optional for kiosk, not required for admin


class HostedPaymentSessionResponse(BaseModel):
    """Response with hosted payment page configuration."""
    merchant_id: str
    user_id: str
    pin: str
    environment: str
    lightbox_url: str


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


class KioskSignupRequest(BaseModel):
    first_name: str
    last_name: str
    phone: str
    email: str | None = None
    pin: str
    rfid_uid: str | None = None
    date_of_birth: date | None = None
    is_senior: bool = False
    gender: str | None = None  # "male", "female", or None


class KioskUpdateProfileRequest(BaseModel):
    member_id: uuid.UUID
    pin: str
    first_name: str | None = None
    last_name: str | None = None
    date_of_birth: date | None = None
    is_senior: bool | None = None
    phone: str | None = None
    email: str | None = None
    gender: str | None = None  # "male", "female", or None


# ==================== TERMINAL PAYMENT SCHEMAS ====================


class TerminalPaymentRequest(BaseModel):
    """Request to initiate a payment on a physical card terminal."""
    member_id: uuid.UUID
    plan_id: uuid.UUID
    pin: str
    save_card: bool = False
    use_credit: bool = False


class TerminalPaymentInitResponse(BaseModel):
    """Response when initiating a terminal payment."""
    request_key: str
    status: str
    amount: Decimal
    error: str | None = None


class TerminalPaymentStatusResponse(BaseModel):
    """Response when checking terminal payment status."""
    request_key: str
    status: str
    complete: bool
    approved: bool = False
    transaction_id: uuid.UUID | None = None
    membership_id: uuid.UUID | None = None
    card_last4: str | None = None
    card_brand: str | None = None
    error: str | None = None


class TerminalInfoResponse(BaseModel):
    """Response with terminal availability info."""
    has_terminal: bool
    terminal_name: str | None = None


# ==================== MANUAL CARD ENTRY SCHEMAS ====================


class ManualCardPaymentRequest(BaseModel):
    """Request to process a card-not-present payment with manual card entry."""
    member_id: uuid.UUID
    plan_id: uuid.UUID
    card_number: str  # Full card number (13-19 digits)
    exp_date: str  # MMYY format
    cvv: str  # 3-4 digits
    pin: str  # Member PIN for verification
    save_card: bool = False  # Whether to save the card for future use
    use_credit: bool = False  # Whether to apply account credit first


class AdminChargeCardRequest(BaseModel):
    """Request for admin to charge a card directly."""
    card_number: str  # Full card number
    exp_date: str  # MMYY format
    cvv: str  # 3-4 digits
    amount: Decimal  # Amount to charge
    description: str | None = None  # Optional transaction description
    save_card: bool = False  # Whether to save the card for future use
