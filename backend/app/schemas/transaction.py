import uuid
from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel

from app.models.transaction import PaymentMethod, TransactionType


class TransactionResponse(BaseModel):
    id: uuid.UUID
    member_id: uuid.UUID | None
    member_name: str | None = None
    transaction_type: TransactionType
    payment_method: PaymentMethod
    amount: Decimal
    plan_id: uuid.UUID | None
    plan_name: str | None = None
    membership_id: uuid.UUID | None
    saved_card_id: uuid.UUID | None = None
    card_last4: str | None = None
    card_brand: str | None = None
    card_name: str | None = None
    reference_id: str | None
    notes: str | None
    created_by: uuid.UUID | None
    created_at: datetime

    model_config = {"from_attributes": True}


class TransactionListResponse(BaseModel):
    items: list[TransactionResponse]
    total: int
    page: int
    per_page: int


class ManualTransactionCreate(BaseModel):
    member_id: uuid.UUID
    transaction_type: TransactionType
    payment_method: PaymentMethod
    amount: Decimal
    plan_id: uuid.UUID | None = None
    notes: str | None = None


class TransactionNotesUpdate(BaseModel):
    notes: str
