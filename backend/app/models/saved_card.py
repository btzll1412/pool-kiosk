import uuid
from datetime import date, datetime

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class SavedCard(Base):
    __tablename__ = "saved_cards"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    member_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("members.id"), index=True)
    processor_token: Mapped[str] = mapped_column(String(500))
    card_last4: Mapped[str] = mapped_column(String(4))
    card_brand: Mapped[str | None] = mapped_column(String(50))
    friendly_name: Mapped[str | None] = mapped_column(String(100))
    is_default: Mapped[bool] = mapped_column(Boolean, default=False)
    auto_charge_plan_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("plans.id"))
    auto_charge_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    next_charge_date: Mapped[date | None] = mapped_column(Date)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    member: Mapped["Member"] = relationship("Member", back_populates="saved_cards")
    auto_charge_plan: Mapped["Plan | None"] = relationship("Plan")
