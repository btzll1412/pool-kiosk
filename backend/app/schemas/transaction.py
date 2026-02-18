import uuid
from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel

from app.models.transaction import PaymentMethod, TransactionType


class TransactionResponse(BaseModel):
    id: uuid.UUID
    member_id: uuid.UUID | None
    transaction_type: TransactionType
    payment_method: PaymentMethod
    amount: Decimal
    plan_id: uuid.UUID | None
    membership_id: uuid.UUID | None
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
