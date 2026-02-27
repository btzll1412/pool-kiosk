import enum
import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import DateTime, Enum, ForeignKey, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class TransactionType(str, enum.Enum):
    payment = "payment"
    refund = "refund"
    credit_add = "credit_add"
    credit_use = "credit_use"
    manual_adjustment = "manual_adjustment"


class PaymentMethod(str, enum.Enum):
    cash = "cash"
    card = "card"
    credit = "credit"
    manual = "manual"


class Transaction(Base):
    __tablename__ = "transactions"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    member_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("members.id"), index=True)
    transaction_type: Mapped[TransactionType] = mapped_column(Enum(TransactionType))
    payment_method: Mapped[PaymentMethod] = mapped_column(Enum(PaymentMethod))
    amount: Mapped[Decimal] = mapped_column(Numeric(10, 2))
    plan_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("plans.id"))
    membership_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("memberships.id"))
    saved_card_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("saved_cards.id"))
    reference_id: Mapped[str | None] = mapped_column(String(255))
    notes: Mapped[str | None] = mapped_column(Text)
    created_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)

    member: Mapped["Member | None"] = relationship("Member", back_populates="transactions")
    plan: Mapped["Plan | None"] = relationship("Plan", lazy="selectin")
    saved_card: Mapped["SavedCard | None"] = relationship("SavedCard", lazy="selectin")
    creator: Mapped["User | None"] = relationship("User")
