"""The pool's clock.

Every "today" / "now" that a rule or report depends on comes from here, so the
configured timezone setting (not the server's clock) decides which day it is.
Timestamps in the database are naive UTC; use utc_bounds() to turn local days
into the UTC window that selects them.
"""
from datetime import date, datetime, time

import pytz
from sqlalchemy.orm import Session

from app.services.settings_service import get_setting

DEFAULT_TZ = "America/New_York"


def local_tz(db: Session):
    try:
        return pytz.timezone(get_setting(db, "timezone", DEFAULT_TZ))
    except pytz.UnknownTimeZoneError:
        return pytz.timezone(DEFAULT_TZ)


def local_now(db: Session) -> datetime:
    """Current time, timezone-aware, in the configured zone."""
    return datetime.now(local_tz(db))


def local_today(db: Session) -> date:
    return local_now(db).date()


def to_local_naive(db: Session, value: datetime | None) -> datetime | None:
    """A wall-clock time in the configured zone, without tzinfo.

    Aware datetimes (e.g. '...Z' from a browser) are converted; naive ones are
    taken to be local already.
    """
    if value is None or value.tzinfo is None:
        return value
    return value.astimezone(local_tz(db)).replace(tzinfo=None)


def utc_bounds(tz, first_day: date, last_day: date | None = None) -> tuple[datetime, datetime]:
    """Naive-UTC [start, end] covering the local days first_day..last_day inclusive."""
    last_day = last_day or first_day
    start = tz.localize(datetime.combine(first_day, time.min)).astimezone(pytz.UTC).replace(tzinfo=None)
    end = tz.localize(datetime.combine(last_day, time.max)).astimezone(pytz.UTC).replace(tzinfo=None)
    return start, end
