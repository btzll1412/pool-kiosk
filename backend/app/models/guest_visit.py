import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import DateTime, ForeignKey, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.transaction import PaymentMethod


class GuestVisit(Base):
    __tablename__ = "guest_visits"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(200))
    phone: Mapped[str | None] = mapped_column(String(20))
    payment_method: Mapped[PaymentMethod] = mapped_column()
    amount_paid: Mapped[Decimal] = mapped_column(Numeric(10, 2))
    plan_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("plans.id"), nullable=True)
    plan_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    plan = relationship("Plan", foreign_keys=[plan_id])
