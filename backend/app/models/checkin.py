import enum
import uuid
from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, Integer, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class CheckinType(str, enum.Enum):
    membership = "membership"
    swim_pass = "swim_pass"
    paid_single = "paid_single"
    free = "free"


class Checkin(Base):
    __tablename__ = "checkins"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    member_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("members.id"), index=True)
    membership_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("memberships.id"))
    checkin_type: Mapped[CheckinType] = mapped_column(Enum(CheckinType))
    guest_count: Mapped[int] = mapped_column(Integer, default=0)
    checked_in_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)
    notes: Mapped[str | None] = mapped_column(Text)

    member: Mapped["Member"] = relationship("Member", back_populates="checkins")
    membership: Mapped["Membership | None"] = relationship("Membership", back_populates="checkins")
