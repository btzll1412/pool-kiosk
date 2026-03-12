import logging
from datetime import date, datetime, timedelta
from decimal import Decimal

import pytz
from sqlalchemy import func, and_
from sqlalchemy.orm import Session

from app.services.settings_service import get_setting

logger = logging.getLogger(__name__)

from app.models.checkin import Checkin
from app.models.guest_visit import GuestVisit
from app.models.membership import Membership
from app.models.plan import PlanType
from app.models.transaction import PaymentMethod, Transaction, TransactionType


def _get_local_today(db: Session) -> date:
    """Get today's date in the configured local timezone."""
    tz_name = get_setting(db, "timezone", "America/New_York")
    try:
        local_tz = pytz.timezone(tz_name)
    except pytz.UnknownTimeZoneError:
        local_tz = pytz.timezone("America/New_York")
    return datetime.now(local_tz).date()


def is_membership_usable(membership: Membership, local_today: date | None = None) -> bool:
    """
    Check if a membership is truly usable (active, not expired, has remaining swims).

    A membership is usable if:
    - is_active is True
    - AND not expired (valid_until is None or >= today)
    - AND has swims remaining (for limited/swim_pass plans)

    Args:
        membership: The membership to check
        local_today: Today's date in the local timezone (optional, defaults to date.today())
    """
    if not membership.is_active:
        return False

    today = local_today if local_today is not None else date.today()

    # Check expiration
    if membership.valid_until and membership.valid_until < today:
        return False

    # Check swims remaining for limited plans
    if membership.swims_total is not None:
        swims_remaining = (membership.swims_total or 0) - (membership.swims_used or 0)
        if swims_remaining <= 0:
            return False

    return True


def get_dashboard_stats(db: Session) -> dict:
    # Use configured timezone for "today" calculation (12am to 12am local time)
    tz_name = get_setting(db, "timezone", "America/New_York")
    try:
        local_tz = pytz.timezone(tz_name)
    except pytz.UnknownTimeZoneError:
        local_tz = pytz.timezone("America/New_York")

    # Get current time in local timezone
    local_now = datetime.now(local_tz)
    local_today = local_now.date()

    # Create start/end of day in local timezone, then convert to UTC for DB query
    today_start_local = local_tz.localize(datetime.combine(local_today, datetime.min.time()))
    today_end_local = local_tz.localize(datetime.combine(local_today, datetime.max.time()))

    # Convert to UTC (naive) for database comparison
    today_start = today_start_local.astimezone(pytz.UTC).replace(tzinfo=None)
    today_end = today_end_local.astimezone(pytz.UTC).replace(tzinfo=None)

    total_checkins = db.query(func.count(Checkin.id)).filter(
        Checkin.checked_in_at.between(today_start, today_end)
    ).scalar() or 0

    unique_members = db.query(func.count(func.distinct(Checkin.member_id))).filter(
        Checkin.checked_in_at.between(today_start, today_end)
    ).scalar() or 0

    # Calculate revenue: payments minus refunds
    payments = db.query(func.coalesce(func.sum(Transaction.amount), 0)).filter(
        Transaction.created_at.between(today_start, today_end),
        Transaction.transaction_type == TransactionType.payment,
    ).scalar()

    refunds = db.query(func.coalesce(func.sum(Transaction.amount), 0)).filter(
        Transaction.created_at.between(today_start, today_end),
        Transaction.transaction_type == TransactionType.refund,
    ).scalar()

    revenue = Decimal(str(payments)) - Decimal(str(refunds))

    # Count truly usable memberships (active, not expired, has remaining swims)
    all_active = db.query(Membership).filter(Membership.is_active.is_(True)).all()
    active_memberships = sum(1 for m in all_active if is_membership_usable(m, local_today))

    guests = db.query(func.count(GuestVisit.id)).filter(
        GuestVisit.created_at.between(today_start, today_end)
    ).scalar() or 0

    return {
        "total_checkins_today": total_checkins,
        "unique_members_today": unique_members,
        "revenue_today": Decimal(str(revenue)),
        "active_memberships": active_memberships,
        "guests_today": guests,
    }


def get_revenue_report(
    db: Session, start_date: date, end_date: date, group_by: str = "day"
) -> tuple[list[dict], Decimal]:
    # Use configured timezone for date interpretation
    tz_name = get_setting(db, "timezone", "America/New_York")
    try:
        local_tz = pytz.timezone(tz_name)
    except pytz.UnknownTimeZoneError:
        local_tz = pytz.timezone("America/New_York")

    # Convert local dates to UTC for database query
    start_local = local_tz.localize(datetime.combine(start_date, datetime.min.time()))
    end_local = local_tz.localize(datetime.combine(end_date, datetime.max.time()))
    start = start_local.astimezone(pytz.UTC).replace(tzinfo=None)
    end = end_local.astimezone(pytz.UTC).replace(tzinfo=None)

    # Get both payments and refunds
    transactions = (
        db.query(Transaction)
        .filter(
            Transaction.created_at.between(start, end),
            Transaction.transaction_type.in_([TransactionType.payment, TransactionType.refund]),
        )
        .all()
    )

    buckets: dict[str, dict] = {}
    grand_total = Decimal("0.00")

    for tx in transactions:
        # Convert UTC timestamp to local timezone for grouping
        utc_dt = pytz.UTC.localize(tx.created_at)
        local_dt = utc_dt.astimezone(local_tz)

        if group_by == "month":
            key = local_dt.strftime("%Y-%m")
        elif group_by == "week":
            key = f"{local_dt.isocalendar()[0]}-W{local_dt.isocalendar()[1]:02d}"
        else:
            key = local_dt.strftime("%Y-%m-%d")

        if key not in buckets:
            buckets[key] = {"total": Decimal("0"), "cash": Decimal("0"), "card": Decimal("0"), "credit": Decimal("0")}

        # Add payments, subtract refunds
        amount = tx.amount if tx.transaction_type == TransactionType.payment else -tx.amount
        buckets[key]["total"] += amount
        grand_total += amount

        if tx.payment_method == PaymentMethod.cash:
            buckets[key]["cash"] += amount
        elif tx.payment_method == PaymentMethod.card:
            buckets[key]["card"] += amount
        elif tx.payment_method == PaymentMethod.credit:
            buckets[key]["credit"] += amount

    items = [
        {"period": k, "total": v["total"], "cash": v["cash"], "card": v["card"], "credit": v["credit"]}
        for k, v in sorted(buckets.items())
    ]
    return items, grand_total


def get_swim_report(db: Session, start_date: date, end_date: date) -> dict:
    # Use configured timezone for date interpretation
    tz_name = get_setting(db, "timezone", "America/New_York")
    try:
        local_tz = pytz.timezone(tz_name)
    except pytz.UnknownTimeZoneError:
        local_tz = pytz.timezone("America/New_York")

    # Convert local dates to UTC for database query
    start_local = local_tz.localize(datetime.combine(start_date, datetime.min.time()))
    end_local = local_tz.localize(datetime.combine(end_date, datetime.max.time()))
    start = start_local.astimezone(pytz.UTC).replace(tzinfo=None)
    end = end_local.astimezone(pytz.UTC).replace(tzinfo=None)

    checkins = db.query(Checkin).filter(Checkin.checked_in_at.between(start, end)).all()

    total = len(checkins)
    unique = len(set(c.member_id for c in checkins))
    days = max((end_date - start_date).days, 1)

    by_type: dict[str, int] = {}
    for c in checkins:
        key = c.checkin_type.value
        by_type[key] = by_type.get(key, 0) + 1

    return {
        "total_swims": total,
        "unique_swimmers": unique,
        "average_daily": round(total / days, 1),
        "by_type": by_type,
    }


def get_membership_report(db: Session) -> dict:
    # Use configured timezone for date calculations
    local_today = _get_local_today(db)

    all_active = db.query(Membership).filter(Membership.is_active.is_(True)).all()

    # Filter to only truly usable memberships
    usable = [m for m in all_active if is_membership_usable(m, local_today)]

    by_plan: dict[str, int] = {}
    expiring_soon = 0
    threshold = local_today + timedelta(days=7)

    for m in usable:
        plan_name = m.plan.name if m.plan else "Unknown"
        by_plan[plan_name] = by_plan.get(plan_name, 0) + 1
        if m.valid_until and m.valid_until <= threshold:
            expiring_soon += 1

    return {
        "total_active": len(usable),
        "by_plan": by_plan,
        "expiring_soon": expiring_soon,
    }
