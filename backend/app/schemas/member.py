import uuid
from datetime import date, datetime
from decimal import Decimal

from pydantic import field_validator, BaseModel, EmailStr


class MemberCreate(BaseModel):
    first_name: str
    last_name: str
    phone: str | None = None
    email: EmailStr | None = None
    photo_url: str | None = None
    pin: str | None = None
    notes: str | None = None
    date_of_birth: date | None = None
    is_senior: bool = False
    gender: str | None = None  # "male", "female", or None


class MemberUpdate(BaseModel):
    first_name: str | None = None
    last_name: str | None = None
    phone: str | None = None
    email: EmailStr | None = None
    photo_url: str | None = None
    notes: str | None = None
    is_active: bool | None = None
    date_of_birth: date | None = None
    is_senior: bool | None = None
    gender: str | None = None  # "male", "female", or None


class ActivePlanInfo(BaseModel):
    """Summary info for an active plan."""
    plan_id: uuid.UUID
    plan_name: str
    plan_type: str  # "unlimited", "limited", "swim_pass"
    swims_remaining: int | None = None  # For limited/swim_pass plans


class MemberResponse(BaseModel):
    id: uuid.UUID
    first_name: str
    last_name: str
    phone: str | None
    email: str | None
    photo_url: str | None
    gender: str | None
    credit_balance: Decimal
    notes: str | None
    is_active: bool
    is_unlimited: bool = False
    charge_to_account_enabled: bool = False
    charge_to_account_limit: Decimal | None = None
    date_of_birth: date | None
    is_senior: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class MemberWithPlansResponse(MemberResponse):
    """Member response with active plans included."""
    active_plans: list[ActivePlanInfo] = []


class MemberListResponse(BaseModel):
    items: list[MemberWithPlansResponse]
    total: int
    page: int
    per_page: int


class CreditAdjustRequest(BaseModel):
    amount: Decimal
    notes: str | None = None


class PinResetRequest(BaseModel):
    new_pin: str


class ChargeToAccountSettings(BaseModel):
    """Whether a member may buy plans on account, and the most they may owe (null = no limit)."""
    enabled: bool
    limit: Decimal | None = None

    @field_validator("limit")
    @classmethod
    def _limit(cls, v: Decimal | None) -> Decimal | None:
        if v is not None and v <= 0:
            raise ValueError("Limit must be greater than zero (leave empty for no limit)")
        return v


# Card data always travels in the request body — never in the URL, where it
# would be written to web server access logs.

def _digits(value: str, label: str, min_len: int, max_len: int) -> str:
    cleaned = value.replace(" ", "").replace("-", "").replace("/", "")
    if not cleaned.isdigit() or not min_len <= len(cleaned) <= max_len:
        expected = f"{min_len}" if min_len == max_len else f"{min_len}-{max_len}"
        raise ValueError(f"{label} must be {expected} digits")
    return cleaned


class AdminCardSwipeRequest(BaseModel):
    track_data: str
    friendly_name: str | None = None


class AdminCardTokenizeRequest(BaseModel):
    card_number: str
    exp_date: str  # MMYY
    cvv: str
    friendly_name: str | None = None

    @field_validator("card_number")
    @classmethod
    def _card_number(cls, v: str) -> str:
        return _digits(v, "Card number", 13, 19)

    @field_validator("exp_date")
    @classmethod
    def _exp_date(cls, v: str) -> str:
        return _digits(v, "Expiration date (MMYY)", 4, 4)

    @field_validator("cvv")
    @classmethod
    def _cvv(cls, v: str) -> str:
        return _digits(v, "CVV", 3, 4)


class AdminCardChargeRequest(AdminCardTokenizeRequest):
    amount: str
    description: str | None = None
    save_card: bool = False

