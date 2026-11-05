import logging
from datetime import date, datetime, time

import pytz
from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.member import Member
from app.models.swipe import Swipe, SwipeOutcome
from app.models.user import User
from app.schemas.swipe import SwipeListResponse
from app.services.auth_service import get_current_user
from app.services.member_service import member_display_names
from app.services.perf_log import StepTimer
from app.services.settings_service import get_setting

logger = logging.getLogger(__name__)

router = APIRouter()


def _parse_hhmm(value: str | None) -> time | None:
    if not value:
        return None
    try:
        hours, minutes = value.split(":")[:2]
        return time(int(hours), int(minutes))
    except (ValueError, IndexError):
        return None


@router.get("", response_model=SwipeListResponse)
def list_swipes(
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
    search: str | None = None,
    outcome: SwipeOutcome | None = None,
    start_date: date | None = None,
    end_date: date | None = None,
    start_time: str | None = Query(None, description="HH:MM, local time"),
    end_time: str | None = Query(None, description="HH:MM, local time"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Every kiosk swipe / lookup, newest first. Same filters as check-ins, plus outcome."""
    tz_name = get_setting(db, "timezone", "America/New_York")
    try:
        local_tz = pytz.timezone(tz_name)
    except pytz.UnknownTimeZoneError:
        local_tz = pytz.timezone("America/New_York")

    query = db.query(Swipe).outerjoin(Member, Swipe.member_id == Member.id)

    if search:
        pattern = f"%{search}%"
        query = query.filter(or_(
            Member.first_name.ilike(pattern),
            Member.last_name.ilike(pattern),
            (Member.first_name + " " + Member.last_name).ilike(pattern),
            Swipe.card_uid.ilike(pattern),
        ))
    if outcome:
        query = query.filter(Swipe.outcome == outcome)
    if start_date:
        start_utc = local_tz.localize(datetime.combine(start_date, time.min)).astimezone(pytz.UTC).replace(tzinfo=None)
        query = query.filter(Swipe.created_at >= start_utc)
    if end_date:
        end_utc = local_tz.localize(datetime.combine(end_date, time.max)).astimezone(pytz.UTC).replace(tzinfo=None)
        query = query.filter(Swipe.created_at <= end_utc)

    filter_start, filter_end = _parse_hhmm(start_time), _parse_hhmm(end_time)
    perf = StepTimer("swipes.list", page=page, per_page=per_page, search=search, outcome=outcome,
                     start_date=start_date, end_date=end_date, start_time=start_time, end_time=end_time)
    swipes = query.order_by(Swipe.created_at.desc()).all()
    perf.step("swipes_query", rows=len(swipes))

    if filter_start or filter_end:
        def in_window(swipe: Swipe) -> bool:
            local_time = pytz.UTC.localize(swipe.created_at).astimezone(local_tz).time()
            return not ((filter_start and local_time < filter_start) or (filter_end and local_time > filter_end))
        swipes = [s for s in swipes if in_window(s)]

    total = len(swipes)
    outcome_counts: dict[str, int] = {}
    members = set()
    for s in swipes:
        outcome_counts[s.outcome.value] = outcome_counts.get(s.outcome.value, 0) + 1
        if s.member_id:
            members.add(s.member_id)

    perf.step("time_filter_and_counts", kept=total, unique_members=len(members))
    start = (page - 1) * per_page
    page_swipes = swipes[start:start + per_page]
    member_names = member_display_names(db, (s.member_id for s in page_swipes))
    perf.step("member_names", members=len(member_names), returned=len(page_swipes))
    perf.__exit__(None, None, None)
    items = [
        {
            "id": s.id,
            "member_id": s.member_id,
            "member_name": member_names.get(s.member_id) if s.member_id else None,
            "card_uid": s.card_uid,
            "source": s.source,
            "outcome": s.outcome,
            "checkin_id": s.checkin_id,
            "created_at": s.created_at,
        }
        for s in page_swipes
    ]
    return {
        "items": items, "total": total, "page": page, "per_page": per_page,
        "unique_members": len(members), "outcome_counts": outcome_counts,
    }
