import logging
from datetime import date, datetime, timedelta
from decimal import Decimal

from sqlalchemy import func, and_
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

from app.models.checkin import Checkin
from app.models.guest_visit import GuestVisit
from app.models.membership import Membership
from app.models.plan import PlanType
from app.models.transaction import PaymentMethod, Transaction, TransactionType


def get_dashboard_stats(db: Session) -> dict:
    # Use UTC for consistency with database timestamps
    utc_now = datetime.utcnow()
    today_start = datetime.combine(utc_now.date(), datetime.min.time())
    today_end = datetime.combine(utc_now.date(), datetime.max.time())

    total_checkins = db.query(func.count(Checkin.id)).filter(
        Checkin.checked_in_at.between(today_start, today_end)
    ).scalar() or 0

    unique_members = db.query(func.count(func.distinct(Checkin.member_id))).filter(
        Checkin.checked_in_at.between(today_start, today_end)
    ).scalar() or 0

    revenue = db.query(func.coalesce(func.sum(Transaction.amount), 0)).filter(
        Transaction.created_at.between(today_start, today_end),
        Transaction.transaction_type == TransactionType.payment,
    ).scalar()

    active_memberships = db.query(func.count(Membership.id)).filter(
        Membership.is_active.is_(True)
    ).scalar() or 0

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
    start = datetime.combine(start_date, datetime.min.time())
    end = datetime.combine(end_date, datetime.max.time())

    transactions = (
        db.query(Transaction)
        .filter(
            Transaction.created_at.between(start, end),
            Transaction.transaction_type == TransactionType.payment,
        )
        .all()
    )

    buckets: dict[str, dict] = {}
    grand_total = Decimal("0.00")

    for tx in transactions:
        if group_by == "month":
            key = tx.created_at.strftime("%Y-%m")
        elif group_by == "week":
            key = f"{tx.created_at.isocalendar()[0]}-W{tx.created_at.isocalendar()[1]:02d}"
        else:
            key = tx.created_at.strftime("%Y-%m-%d")

        if key not in buckets:
            buckets[key] = {"total": Decimal("0"), "cash": Decimal("0"), "card": Decimal("0"), "credit": Decimal("0")}

        buckets[key]["total"] += tx.amount
        grand_total += tx.amount

        if tx.payment_method == PaymentMethod.cash:
            buckets[key]["cash"] += tx.amount
        elif tx.payment_method == PaymentMethod.card:
            buckets[key]["card"] += tx.amount
        elif tx.payment_method == PaymentMethod.credit:
            buckets[key]["credit"] += tx.amount

    items = [
        {"period": k, "total": v["total"], "cash": v["cash"], "card": v["card"], "credit": v["credit"]}
        for k, v in sorted(buckets.items())
    ]
    return items, grand_total


def get_swim_report(db: Session, start_date: date, end_date: date) -> dict:
    start = datetime.combine(start_date, datetime.min.time())
    end = datetime.combine(end_date, datetime.max.time())

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
    active = db.query(Membership).filter(Membership.is_active.is_(True)).all()

    by_plan: dict[str, int] = {}
    expiring_soon = 0
    threshold = date.today() + timedelta(days=7)

    for m in active:
        plan_name = m.plan.name if m.plan else "Unknown"
        by_plan[plan_name] = by_plan.get(plan_name, 0) + 1
        if m.valid_until and m.valid_until <= threshold:
            expiring_soon += 1

    return {
        "total_active": len(active),
        "by_plan": by_plan,
        "expiring_soon": expiring_soon,
    }
