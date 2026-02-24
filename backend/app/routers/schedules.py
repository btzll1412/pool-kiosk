import logging
import uuid
from datetime import datetime, time, timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

from app.database import get_db
from app.models.pool_schedule import PoolSchedule, ScheduleOverride, ScheduleType
from app.models.user import User
from app.schemas.pool_schedule import (
    CurrentScheduleResponse,
    PoolScheduleCreate,
    PoolScheduleResponse,
    PoolScheduleUpdate,
    ScheduleOverrideCreate,
    ScheduleOverrideResponse,
    ScheduleOverrideUpdate,
    WeeklyScheduleResponse,
)
from app.services.auth_service import get_current_user

router = APIRouter()

DAY_NAMES = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]


@router.get("", response_model=list[PoolScheduleResponse])
def list_schedules(
    is_active: bool | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List all pool schedules."""
    query = db.query(PoolSchedule)
    if is_active is not None:
        query = query.filter(PoolSchedule.is_active == is_active)
    schedules = query.order_by(PoolSchedule.day_of_week, PoolSchedule.start_time).all()
    return schedules


@router.get("/weekly", response_model=WeeklyScheduleResponse)
def get_weekly_schedule(
    db: Session = Depends(get_db),
):
    """Get the full weekly schedule organized by day. No auth required for kiosk display."""
    schedules = (
        db.query(PoolSchedule)
        .filter(PoolSchedule.is_active == True)
        .order_by(PoolSchedule.day_of_week, PoolSchedule.start_time, PoolSchedule.priority.desc())
        .all()
    )

    # Organize by day
    by_day = {day: [] for day in DAY_NAMES}
    for s in schedules:
        day_name = DAY_NAMES[s.day_of_week]
        by_day[day_name].append(s)

    return WeeklyScheduleResponse(**by_day)


@router.get("/current", response_model=CurrentScheduleResponse)
def get_current_schedule(
    db: Session = Depends(get_db),
):
    """Get the current pool status based on schedule. No auth required for kiosk display."""
    now = datetime.now()
    current_day = now.weekday()  # 0=Monday
    current_time = now.time()

    # First check for active schedule overrides
    active_override = (
        db.query(ScheduleOverride)
        .filter(
            ScheduleOverride.is_active == True,
            ScheduleOverride.start_datetime <= now,
            ScheduleOverride.end_datetime > now,
        )
        .first()
    )

    if active_override:
        # Override takes precedence
        is_open = active_override.schedule_type not in [ScheduleType.closed, ScheduleType.maintenance]

        if active_override.schedule_type == ScheduleType.men_only:
            status_message = f"{active_override.name} - Men's Hours"
            restrictions = "men_only"
        elif active_override.schedule_type == ScheduleType.women_only:
            status_message = f"{active_override.name} - Women's Hours"
            restrictions = "women_only"
        elif active_override.schedule_type == ScheduleType.closed:
            status_message = f"{active_override.name} - Pool Closed"
            restrictions = None
        elif active_override.schedule_type == ScheduleType.maintenance:
            status_message = f"{active_override.name} - Closed for Maintenance"
            restrictions = None
        elif active_override.schedule_type == ScheduleType.lap_swim:
            status_message = f"{active_override.name} - Lap Swim"
            restrictions = None
        elif active_override.schedule_type == ScheduleType.lessons:
            status_message = f"{active_override.name} - Lessons"
            restrictions = None
        else:
            status_message = f"{active_override.name} - Open Swim"
            restrictions = None

        return CurrentScheduleResponse(
            current_block=None,  # Override, not a regular block
            next_block=None,
            is_open=is_open,
            status_message=status_message,
            restrictions=restrictions,
            active_override=ScheduleOverrideResponse.model_validate(active_override),
        )

    # Find current schedule block
    current_block = (
        db.query(PoolSchedule)
        .filter(
            PoolSchedule.is_active == True,
            PoolSchedule.day_of_week == current_day,
            PoolSchedule.start_time <= current_time,
            PoolSchedule.end_time > current_time,
        )
        .order_by(PoolSchedule.priority.desc())
        .first()
    )

    # Find next schedule block
    next_block = None

    # First check for next block today
    next_today = (
        db.query(PoolSchedule)
        .filter(
            PoolSchedule.is_active == True,
            PoolSchedule.day_of_week == current_day,
            PoolSchedule.start_time > current_time,
        )
        .order_by(PoolSchedule.start_time)
        .first()
    )

    if next_today:
        next_block = next_today
    else:
        # Check tomorrow and following days
        for day_offset in range(1, 8):
            check_day = (current_day + day_offset) % 7
            first_block = (
                db.query(PoolSchedule)
                .filter(
                    PoolSchedule.is_active == True,
                    PoolSchedule.day_of_week == check_day,
                )
                .order_by(PoolSchedule.start_time)
                .first()
            )
            if first_block:
                next_block = first_block
                break

    # Determine status
    if current_block:
        is_open = current_block.schedule_type not in [ScheduleType.closed, ScheduleType.maintenance]

        if current_block.schedule_type == ScheduleType.men_only:
            status_message = f"{current_block.name} - Men's Hours"
            restrictions = "men_only"
        elif current_block.schedule_type == ScheduleType.women_only:
            status_message = f"{current_block.name} - Women's Hours"
            restrictions = "women_only"
        elif current_block.schedule_type == ScheduleType.closed:
            status_message = "Pool Closed"
            restrictions = None
        elif current_block.schedule_type == ScheduleType.maintenance:
            status_message = "Pool Closed for Maintenance"
            restrictions = None
        elif current_block.schedule_type == ScheduleType.lap_swim:
            status_message = f"{current_block.name} - Lap Swim"
            restrictions = None
        elif current_block.schedule_type == ScheduleType.lessons:
            status_message = f"{current_block.name} - Lessons in Progress"
            restrictions = None
        else:
            status_message = f"{current_block.name} - Open Swim"
            restrictions = None
    else:
        is_open = False
        status_message = "Pool Closed"
        restrictions = None

    return CurrentScheduleResponse(
        current_block=current_block,
        next_block=next_block,
        is_open=is_open,
        status_message=status_message,
        restrictions=restrictions,
        active_override=None,
    )


@router.post("", response_model=PoolScheduleResponse, status_code=201)
def create_schedule(
    data: PoolScheduleCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a new schedule block."""
    if data.day_of_week < 0 or data.day_of_week > 6:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="day_of_week must be 0-6 (Monday-Sunday)"
        )

    if data.start_time >= data.end_time:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="start_time must be before end_time"
        )

    schedule = PoolSchedule(
        name=data.name,
        schedule_type=data.schedule_type,
        day_of_week=data.day_of_week,
        start_time=data.start_time,
        end_time=data.end_time,
        is_active=data.is_active,
        priority=data.priority,
        notes=data.notes,
    )
    db.add(schedule)
    db.commit()
    db.refresh(schedule)

    logger.info("Schedule created: id=%s, name=%s, type=%s, by=%s",
               schedule.id, schedule.name, schedule.schedule_type, current_user.id)
    return schedule


@router.put("/{schedule_id}", response_model=PoolScheduleResponse)
def update_schedule(
    schedule_id: uuid.UUID,
    data: PoolScheduleUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update a schedule block."""
    schedule = db.query(PoolSchedule).filter(PoolSchedule.id == schedule_id).first()
    if not schedule:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Schedule not found")

    update_data = data.model_dump(exclude_unset=True)

    if "day_of_week" in update_data:
        if update_data["day_of_week"] < 0 or update_data["day_of_week"] > 6:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="day_of_week must be 0-6 (Monday-Sunday)"
            )

    # Validate time range
    start = update_data.get("start_time", schedule.start_time)
    end = update_data.get("end_time", schedule.end_time)
    if start >= end:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="start_time must be before end_time"
        )

    for key, value in update_data.items():
        setattr(schedule, key, value)

    db.commit()
    db.refresh(schedule)

    logger.info("Schedule updated: id=%s, by=%s", schedule_id, current_user.id)
    return schedule


@router.delete("/{schedule_id}")
def delete_schedule(
    schedule_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete a schedule block."""
    schedule = db.query(PoolSchedule).filter(PoolSchedule.id == schedule_id).first()
    if not schedule:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Schedule not found")

    db.delete(schedule)
    db.commit()

    logger.info("Schedule deleted: id=%s, by=%s", schedule_id, current_user.id)
    return {"message": "Schedule deleted"}


@router.post("/bulk", response_model=list[PoolScheduleResponse], status_code=201)
def create_bulk_schedules(
    schedules: list[PoolScheduleCreate],
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create multiple schedule blocks at once."""
    created = []
    for data in schedules:
        if data.day_of_week < 0 or data.day_of_week > 6:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"day_of_week must be 0-6 for schedule '{data.name}'"
            )
        if data.start_time >= data.end_time:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"start_time must be before end_time for schedule '{data.name}'"
            )

        schedule = PoolSchedule(
            name=data.name,
            schedule_type=data.schedule_type,
            day_of_week=data.day_of_week,
            start_time=data.start_time,
            end_time=data.end_time,
            is_active=data.is_active,
            priority=data.priority,
            notes=data.notes,
        )
        db.add(schedule)
        created.append(schedule)

    db.commit()
    for s in created:
        db.refresh(s)

    logger.info("Bulk schedules created: count=%d, by=%s", len(created), current_user.id)
    return created


@router.delete("/bulk")
def delete_all_schedules(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete all schedule blocks. Use with caution."""
    count = db.query(PoolSchedule).delete()
    db.commit()

    logger.info("All schedules deleted: count=%d, by=%s", count, current_user.id)
    return {"message": f"Deleted {count} schedules"}


# ==================== SCHEDULE OVERRIDES ====================

@router.get("/overrides", response_model=list[ScheduleOverrideResponse])
def list_overrides(
    include_expired: bool = False,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List all schedule overrides."""
    query = db.query(ScheduleOverride)
    if not include_expired:
        query = query.filter(ScheduleOverride.end_datetime > datetime.now())
    overrides = query.order_by(ScheduleOverride.start_datetime.desc()).all()
    return overrides


@router.post("/overrides", response_model=ScheduleOverrideResponse, status_code=201)
def create_override(
    data: ScheduleOverrideCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a schedule override for special occasions."""
    if data.start_datetime >= data.end_datetime:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="start_datetime must be before end_datetime"
        )

    override = ScheduleOverride(
        name=data.name,
        schedule_type=data.schedule_type,
        start_datetime=data.start_datetime,
        end_datetime=data.end_datetime,
        is_active=data.is_active,
        notes=data.notes,
        created_by=current_user.id,
    )
    db.add(override)
    db.commit()
    db.refresh(override)

    logger.info("Schedule override created: id=%s, name=%s, type=%s, from=%s to=%s, by=%s",
               override.id, override.name, override.schedule_type,
               override.start_datetime, override.end_datetime, current_user.id)
    return override


@router.get("/overrides/{override_id}", response_model=ScheduleOverrideResponse)
def get_override(
    override_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get a specific schedule override."""
    override = db.query(ScheduleOverride).filter(ScheduleOverride.id == override_id).first()
    if not override:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Override not found")
    return override


@router.put("/overrides/{override_id}", response_model=ScheduleOverrideResponse)
def update_override(
    override_id: uuid.UUID,
    data: ScheduleOverrideUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update a schedule override."""
    override = db.query(ScheduleOverride).filter(ScheduleOverride.id == override_id).first()
    if not override:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Override not found")

    update_data = data.model_dump(exclude_unset=True)

    # Validate time range
    start = update_data.get("start_datetime", override.start_datetime)
    end = update_data.get("end_datetime", override.end_datetime)
    if start >= end:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="start_datetime must be before end_datetime"
        )

    for key, value in update_data.items():
        setattr(override, key, value)

    db.commit()
    db.refresh(override)

    logger.info("Schedule override updated: id=%s, by=%s", override_id, current_user.id)
    return override


@router.delete("/overrides/{override_id}")
def delete_override(
    override_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete a schedule override."""
    override = db.query(ScheduleOverride).filter(ScheduleOverride.id == override_id).first()
    if not override:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Override not found")

    db.delete(override)
    db.commit()

    logger.info("Schedule override deleted: id=%s, by=%s", override_id, current_user.id)
    return {"message": "Override deleted"}
