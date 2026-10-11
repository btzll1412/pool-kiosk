import enum
import uuid
from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class SwipeSource(str, enum.Enum):
    card = "card"      # RFID card read at the kiosk
    search = "search"  # member looked themselves up by name


class SwipeOutcome(str, enum.Enum):
    checked_in = "checked_in"          # a check-in followed
    no_action = "no_action"            # recognised, had a usable plan, but never tapped check-in
    no_plan = "no_plan"                # recognised, never had a plan
    expired = "expired"                # recognised, plan expired / swims used up
    frozen = "frozen"                  # recognised, membership frozen
    outside_hours = "outside_hours"    # tried to check in during closed / wrong-gender hours
    unknown_card = "unknown_card"      # card not assigned to anyone
    inactive_member = "inactive_member"


class Swipe(Base):
    """Every time someone presents themselves at the kiosk — whether or not a check-in follows."""

    __tablename__ = "swipes"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    member_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("members.id"), index=True)
    card_uid: Mapped[str | None] = mapped_column(String(100))
    source: Mapped[SwipeSource] = mapped_column(Enum(SwipeSource), default=SwipeSource.card)
    outcome: Mapped[SwipeOutcome] = mapped_column(Enum(SwipeOutcome), index=True)
    checkin_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("checkins.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)

    member: Mapped["Member | None"] = relationship("Member")
