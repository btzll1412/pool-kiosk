import uuid
from datetime import date, datetime

from sqlalchemy import Boolean, Date, DateTime, Enum, ForeignKey, Integer
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.plan import PlanType


class Membership(Base):
    __tablename__ = "memberships"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    member_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("members.id"), index=True)
    plan_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("plans.id"))
    plan_type: Mapped[PlanType] = mapped_column(Enum(PlanType))
    swims_total: Mapped[int | None] = mapped_column(Integer)
    swims_used: Mapped[int] = mapped_column(Integer, default=0)
    valid_from: Mapped[date | None] = mapped_column(Date)
    valid_until: Mapped[date | None] = mapped_column(Date)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    member: Mapped["Member"] = relationship("Member", back_populates="memberships")
    plan: Mapped["Plan"] = relationship("Plan", lazy="selectin")
    checkins: Mapped[list["Checkin"]] = relationship("Checkin", back_populates="membership")
    freezes: Mapped[list["MembershipFreeze"]] = relationship("MembershipFreeze", back_populates="membership")
