import enum
import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import Boolean, DateTime, Enum, Integer, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class PlanType(str, enum.Enum):
    single = "single"
    swim_pass = "swim_pass"
    monthly = "monthly"


class Plan(Base):
    __tablename__ = "plans"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(200))
    plan_type: Mapped[PlanType] = mapped_column(Enum(PlanType))
    price: Mapped[Decimal] = mapped_column(Numeric(10, 2))
    swim_count: Mapped[int | None] = mapped_column(Integer)
    duration_days: Mapped[int | None] = mapped_column(Integer)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    display_order: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
