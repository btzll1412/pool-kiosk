import uuid
from datetime import datetime, time

from pydantic import BaseModel

from app.models.pool_schedule import ScheduleType


class PoolScheduleCreate(BaseModel):
    name: str
    schedule_type: ScheduleType
    day_of_week: int  # 0=Monday, 6=Sunday
    start_time: time
    end_time: time
    is_active: bool = True
    priority: int = 0
    notes: str | None = None


class PoolScheduleUpdate(BaseModel):
    name: str | None = None
    schedule_type: ScheduleType | None = None
    day_of_week: int | None = None
    start_time: time | None = None
    end_time: time | None = None
    is_active: bool | None = None
    priority: int | None = None
    notes: str | None = None


class PoolScheduleResponse(BaseModel):
    id: uuid.UUID
    name: str
    schedule_type: ScheduleType
    day_of_week: int
    start_time: time
    end_time: time
    is_active: bool
    priority: int
    notes: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class ScheduleOverrideResponse(BaseModel):
    id: uuid.UUID
    name: str
    schedule_type: ScheduleType
    start_datetime: datetime
    end_datetime: datetime
    is_active: bool
    notes: str | None
    created_at: datetime
    created_by: uuid.UUID | None

    model_config = {"from_attributes": True}


class CurrentScheduleResponse(BaseModel):
    """Response for current pool status based on schedule."""
    current_block: PoolScheduleResponse | None
    next_block: PoolScheduleResponse | None
    is_open: bool
    status_message: str
    restrictions: str | None  # "men_only", "women_only", or None
    active_override: ScheduleOverrideResponse | None = None  # Active override if any


class WeeklyScheduleResponse(BaseModel):
    """Full weekly schedule organized by day."""
    monday: list[PoolScheduleResponse]
    tuesday: list[PoolScheduleResponse]
    wednesday: list[PoolScheduleResponse]
    thursday: list[PoolScheduleResponse]
    friday: list[PoolScheduleResponse]
    saturday: list[PoolScheduleResponse]
    sunday: list[PoolScheduleResponse]


# Schedule Override schemas
class ScheduleOverrideCreate(BaseModel):
    name: str
    schedule_type: ScheduleType
    start_datetime: datetime
    end_datetime: datetime
    is_active: bool = True
    notes: str | None = None


class ScheduleOverrideUpdate(BaseModel):
    name: str | None = None
    schedule_type: ScheduleType | None = None
    start_datetime: datetime | None = None
    end_datetime: datetime | None = None
    is_active: bool | None = None
    notes: str | None = None
