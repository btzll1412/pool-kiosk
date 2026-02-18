import uuid
from datetime import date, datetime

from sqlalchemy import Date, DateTime, ForeignKey, Integer, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class MembershipFreeze(Base):
    __tablename__ = "membership_freezes"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    membership_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("memberships.id"), index=True)
    frozen_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"))
    freeze_start: Mapped[date] = mapped_column(Date)
    freeze_end: Mapped[date | None] = mapped_column(Date)
    days_extended: Mapped[int] = mapped_column(Integer, default=0)
    reason: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    membership: Mapped["Membership"] = relationship("Membership", back_populates="freezes")
    frozen_by_user: Mapped["User | None"] = relationship("User")
