import uuid
from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, EmailStr


class MemberCreate(BaseModel):
    first_name: str
    last_name: str
    phone: str | None = None
    email: EmailStr | None = None
    photo_url: str | None = None
    pin: str | None = None
    notes: str | None = None


class MemberUpdate(BaseModel):
    first_name: str | None = None
    last_name: str | None = None
    phone: str | None = None
    email: EmailStr | None = None
    photo_url: str | None = None
    notes: str | None = None
    is_active: bool | None = None


class MemberResponse(BaseModel):
    id: uuid.UUID
    first_name: str
    last_name: str
    phone: str | None
    email: str | None
    photo_url: str | None
    credit_balance: Decimal
    notes: str | None
    is_active: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class MemberListResponse(BaseModel):
    items: list[MemberResponse]
    total: int
    page: int
    per_page: int


class CreditAdjustRequest(BaseModel):
    amount: Decimal
    notes: str | None = None
