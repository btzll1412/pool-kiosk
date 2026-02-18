import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import Boolean, DateTime, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Member(Base):
    __tablename__ = "members"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    first_name: Mapped[str] = mapped_column(String(100))
    last_name: Mapped[str] = mapped_column(String(100))
    phone: Mapped[str | None] = mapped_column(String(20), index=True)
    email: Mapped[str | None] = mapped_column(String(255))
    photo_url: Mapped[str | None] = mapped_column(String(500))
    pin_hash: Mapped[str | None] = mapped_column(String(255))
    credit_balance: Mapped[Decimal] = mapped_column(Numeric(10, 2), default=Decimal("0.00"))
    notes: Mapped[str | None] = mapped_column(Text)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    cards: Mapped[list["Card"]] = relationship("Card", back_populates="member", lazy="selectin")
    memberships: Mapped[list["Membership"]] = relationship("Membership", back_populates="member", lazy="selectin")
    checkins: Mapped[list["Checkin"]] = relationship("Checkin", back_populates="member")
    transactions: Mapped[list["Transaction"]] = relationship("Transaction", back_populates="member")
    saved_cards: Mapped[list["SavedCard"]] = relationship("SavedCard", back_populates="member")
    pin_lockout: Mapped["PinLockout | None"] = relationship("PinLockout", back_populates="member", uselist=False)
