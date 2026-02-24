import enum
import uuid
from datetime import datetime, time

from sqlalchemy import Boolean, DateTime, Enum, Integer, SmallInteger, String, Time
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class ScheduleType(str, enum.Enum):
    open = "open"  # Open to everyone
    men_only = "men_only"  # Men's hours
    women_only = "women_only"  # Women's hours
    lap_swim = "lap_swim"  # Lap swimming only
    lessons = "lessons"  # Swim lessons
    maintenance = "maintenance"  # Pool maintenance/closed
    closed = "closed"  # Closed


# Create enum type with create_type=False since it's created via migration
schedule_type_enum = Enum(ScheduleType, name='scheduletype', create_type=False)


class PoolSchedule(Base):
    __tablename__ = "pool_schedules"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(100))  # e.g., "Morning Men's Swim"
    schedule_type: Mapped[ScheduleType] = mapped_column(schedule_type_enum)
    day_of_week: Mapped[int] = mapped_column(SmallInteger)  # 0=Monday, 6=Sunday
    start_time: Mapped[time] = mapped_column(Time)
    end_time: Mapped[time] = mapped_column(Time)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    priority: Mapped[int] = mapped_column(Integer, default=0)  # Higher priority overrides
    notes: Mapped[str | None] = mapped_column(String(500))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class ScheduleOverride(Base):
    """Temporary schedule override for special occasions/events."""
    __tablename__ = "schedule_overrides"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(100))  # e.g., "Holiday Hours", "Private Event"
    schedule_type: Mapped[ScheduleType] = mapped_column(schedule_type_enum)
    start_datetime: Mapped[datetime] = mapped_column(DateTime)  # When override starts
    end_datetime: Mapped[datetime] = mapped_column(DateTime)  # When override ends
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    notes: Mapped[str | None] = mapped_column(String(500))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    created_by: Mapped[uuid.UUID | None] = mapped_column(nullable=True)  # Admin who created it
