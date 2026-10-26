"""Monthly report: everything that happened in one month or a range of months,
optionally narrowed to one or more customers.

Revenue is counted by payment date (when the money came in), not by the
membership period it paid for.
"""

import calendar
import re
import uuid
from collections import defaultdict
from datetime import date, datetime, timedelta
from decimal import Decimal

import pytz
from fastapi import HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from app.models.checkin import Checkin
from app.models.guest_visit import GuestVisit
from app.models.member import Member
from app.models.membership import Membership
from app.models.transaction import PaymentMethod, Transaction, TransactionType
from app.services.settings_service import get_setting

MONTH_RE = re.compile(r"^(\d{4})-(\d{2})$")
MAX_MONTHS = 60
ZERO = Decimal("0.00")

# Payment transactions are stored with only cash/card/credit; the finer kind we
# show on the report is recovered from the saved-card link and the note prefix.
METHOD_LABELS = {
    "cash": "Cash",
    "card": "Card",
    "card_on_file": "Card on file",
    "credit": "Account credit",
    "account": "Charged to account",
    "manual": "Manual",
}
GUEST_NOTE_RE = re.compile(r"^Guest visit: (.+?) - ")


def _local_tz(db: Session):
    tz_name = get_setting(db, "timezone", "America/New_York")
    try:
        return pytz.timezone(tz_name)
    except pytz.UnknownTimeZoneError:
        return pytz.timezone("America/New_York")


def parse_month(value: str, name: str) -> tuple[int, int]:
    m = MONTH_RE.match(value or "")
    if not m or not 1 <= int(m.group(2)) <= 12:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"{name} must look like YYYY-MM")
    return int(m.group(1)), int(m.group(2))


def month_range(start: str, end: str) -> list[str]:
    """['2026-06', '2026-07', ...] inclusive; start must not be after end."""
    sy, sm = parse_month(start, "start")
    ey, em = parse_month(end, "end")
    if (sy, sm) > (ey, em):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "start month is after end month")
    months = []
    y, mo = sy, sm
    while (y, mo) <= (ey, em):
        months.append(f"{y:04d}-{mo:02d}")
        mo += 1
        if mo == 13:
            y, mo = y + 1, 1
    if len(months) > MAX_MONTHS:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Pick at most {MAX_MONTHS} months at a time")
    return months


def month_label(period: str) -> str:
    y, m = period.split("-")
    return f"{calendar.month_name[int(m)]} {y}"


def month_dates(period: str) -> tuple[date, date]:
    y, m = (int(p) for p in period.split("-"))
    return date(y, m, 1), date(y, m, calendar.monthrange(y, m)[1])


def _utc_bounds(local_tz, first_day: date, last_day: date) -> tuple[datetime, datetime]:
    start_local = local_tz.localize(datetime.combine(first_day, datetime.min.time()))
    end_local = local_tz.localize(datetime.combine(last_day, datetime.max.time()))
    return (
        start_local.astimezone(pytz.UTC).replace(tzinfo=None),
        end_local.astimezone(pytz.UTC).replace(tzinfo=None),
    )


def _period_of(local_tz, utc_naive: datetime) -> str:
    return pytz.UTC.localize(utc_naive).astimezone(local_tz).strftime("%Y-%m")


def classify_method(tx: Transaction) -> str:
    if tx.payment_method == PaymentMethod.cash:
        return "cash"
    if tx.payment_method == PaymentMethod.card:
        return "card_on_file" if tx.saved_card_id else "card"
    if tx.payment_method == PaymentMethod.credit:
        if tx.notes and "Charged to account" in tx.notes:
            return "account"
        return "credit"
    return "manual"


def guest_name_of(tx: Transaction) -> str | None:
    if tx.guest_name:
        return tx.guest_name
    if tx.member_id is None and tx.notes:
        m = GUEST_NOTE_RE.match(tx.notes)
        if m:
            return m.group(1)
    return None


def _empty_bucket() -> dict:
    return {
        "total": ZERO,
        "cash": ZERO,
        "card": ZERO,
        "card_on_file": ZERO,
        "credit": ZERO,
        "account": ZERO,
        "refunds": ZERO,
        "credits_added": ZERO,
        "sales": 0,
        "swims": 0,
        "swim_guests": 0,
        "guest_visits": 0,
        "unique_swimmers": 0,
        "memberships_started": 0,
        "memberships_expired": 0,
        "active_at_end": 0,
    }


def _card_label(tx: Transaction) -> str | None:
    card = tx.saved_card
    if not card:
        return None
    return card.friendly_name or f"{card.card_brand or 'Card'} ****{card.card_last4}"


def get_monthly_report(
    db: Session,
    start: str,
    end: str,
    member_ids: list[uuid.UUID] | None = None,
) -> dict:
    local_tz = _local_tz(db)
    months = month_range(start, end)
    first_day, _ = month_dates(months[0])
    _, last_day = month_dates(months[-1])
    utc_start, utc_end = _utc_bounds(local_tz, first_day, last_day)
    member_filter = set(member_ids or [])

    # --- members (names for everything below) ---
    members_q = db.query(Member)
    if member_filter:
        members_q = members_q.filter(Member.id.in_(member_filter))
    members = {m.id: m for m in members_q.all()}
    if member_filter and len(members) != len(member_filter):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "One of the selected members does not exist")

    def name_of(member_id):
        m = members.get(member_id)
        return f"{m.first_name} {m.last_name}".strip() if m else None

    # --- transactions ---
    tx_q = (
        db.query(Transaction)
        .options(joinedload(Transaction.member))
        .filter(Transaction.created_at.between(utc_start, utc_end))
    )
    if member_filter:
        tx_q = tx_q.filter(Transaction.member_id.in_(member_filter))
    transactions = tx_q.order_by(Transaction.created_at.desc()).all()

    # --- check-ins ---
    ci_q = db.query(Checkin).filter(Checkin.checked_in_at.between(utc_start, utc_end))
    if member_filter:
        ci_q = ci_q.filter(Checkin.member_id.in_(member_filter))
    checkins = ci_q.order_by(Checkin.checked_in_at.desc()).all()
    # names for members outside the filter never matter here (filter applies), but
    # with no filter we still need every swimmer's name
    missing = {c.member_id for c in checkins} - set(members)
    if missing:
        for m in db.query(Member).filter(Member.id.in_(missing)).all():
            members[m.id] = m

    # --- guest visits (no member filter: guests are not members) ---
    guest_visits = []
    if not member_filter:
        guest_visits = (
            db.query(GuestVisit)
            .filter(GuestVisit.created_at.between(utc_start, utc_end))
            .order_by(GuestVisit.created_at.desc())
            .all()
        )

    # --- memberships started / expired in the period, active at each month end ---
    ms_q = db.query(Membership).options(joinedload(Membership.member))
    if member_filter:
        ms_q = ms_q.filter(Membership.member_id.in_(member_filter))
    all_memberships = ms_q.filter(
        (Membership.valid_from <= last_day) | (Membership.valid_from.is_(None)),
        (Membership.valid_until >= first_day) | (Membership.valid_until.is_(None)),
    ).all()

    buckets = {p: _empty_bucket() for p in months}
    swimmers: dict[str, set] = defaultdict(set)
    by_plan: dict[str, dict] = {}
    per_member: dict[uuid.UUID, dict] = {}

    def member_row(member_id):
        if member_id not in per_member:
            per_member[member_id] = {
                "member_id": str(member_id),
                "name": name_of(member_id) or "Unknown member",
                "total": ZERO,
                "sales": 0,
                "refunds": ZERO,
                "account": ZERO,
                "credits_added": ZERO,
                "swims": 0,
                "memberships_started": [],
            }
        return per_member[member_id]

    tx_items = []
    for tx in transactions:
        period = _period_of(local_tz, tx.created_at)
        b = buckets.get(period)
        if b is None:
            continue
        method = classify_method(tx)
        kind = tx.transaction_type
        signed = tx.amount
        row = member_row(tx.member_id) if tx.member_id else None

        if kind == TransactionType.payment:
            b["total"] += tx.amount
            b["sales"] += 1
            b[method if method in ("cash", "card", "card_on_file", "credit", "account") else "cash"] += tx.amount
            if row is not None:
                row["total"] += tx.amount
                row["sales"] += 1
                if method == "account":
                    row["account"] += tx.amount
            plan_name = tx.plan.name if tx.plan else None
            if plan_name is None and tx.member_id is None:
                plan_name = "Guest visit"
            if plan_name:
                p = by_plan.setdefault(plan_name, {"plan": plan_name, "count": 0, "amount": ZERO})
                p["count"] += 1
                p["amount"] += tx.amount
        elif kind == TransactionType.refund:
            b["total"] -= tx.amount
            b["refunds"] += tx.amount
            signed = -tx.amount
            if row is not None:
                row["total"] -= tx.amount
                row["refunds"] += tx.amount
        elif kind == TransactionType.credit_add:
            b["credits_added"] += tx.amount
            if row is not None:
                row["credits_added"] += tx.amount
        elif kind == TransactionType.credit_use:
            signed = -tx.amount
        elif kind == TransactionType.manual_adjustment:
            signed = tx.amount  # stored negative already

        tx_items.append(
            {
                "id": str(tx.id),
                "created_at": tx.created_at,
                "period": period,
                "member_id": str(tx.member_id) if tx.member_id else None,
                "member_name": name_of(tx.member_id) if tx.member_id else None,
                "guest_name": guest_name_of(tx),
                "transaction_type": kind.value,
                "method": method,
                "method_label": METHOD_LABELS[method],
                "card": _card_label(tx),
                "plan_name": tx.plan.name if tx.plan else None,
                "amount": signed,
                "notes": tx.notes,
            }
        )

    ci_items = []
    for c in checkins:
        period = _period_of(local_tz, c.checked_in_at)
        b = buckets.get(period)
        if b is None:
            continue
        b["swims"] += 1
        b["swim_guests"] += c.guest_count or 0
        swimmers[period].add(c.member_id)
        member_row(c.member_id)["swims"] += 1
        if member_filter:
            ci_items.append(
                {
                    "id": str(c.id),
                    "checked_in_at": c.checked_in_at,
                    "period": period,
                    "member_id": str(c.member_id),
                    "member_name": name_of(c.member_id),
                    "checkin_type": c.checkin_type.value,
                    "guest_count": c.guest_count or 0,
                }
            )
    for period, ids in swimmers.items():
        buckets[period]["unique_swimmers"] = len(ids)

    for v in guest_visits:
        period = _period_of(local_tz, v.created_at)
        if period in buckets:
            buckets[period]["guest_visits"] += 1

    started, expired = [], []
    for m in all_memberships:
        plan_name = m.plan.name if m.plan else m.plan_type.value
        entry = {
            "membership_id": str(m.id),
            "member_id": str(m.member_id),
            "member_name": name_of(m.member_id) or (f"{m.member.first_name} {m.member.last_name}" if m.member else None),
            "plan_name": plan_name,
            "valid_from": m.valid_from,
            "valid_until": m.valid_until,
            "is_active": m.is_active,
        }
        start_day = m.valid_from or m.created_at.date()
        if first_day <= start_day <= last_day:
            period = start_day.strftime("%Y-%m")
            buckets[period]["memberships_started"] += 1
            started.append(entry)
            member_row(m.member_id)["memberships_started"].append(plan_name)
        if m.valid_until and first_day <= m.valid_until <= last_day:
            buckets[m.valid_until.strftime("%Y-%m")]["memberships_expired"] += 1
            expired.append(entry)
        for period in months:
            _, month_end = month_dates(period)
            if start_day <= month_end and (m.valid_until is None or m.valid_until >= month_end) and m.is_active:
                buckets[period]["active_at_end"] += 1

    totals = _empty_bucket()
    for b in buckets.values():
        for k, v in b.items():
            if k in ("unique_swimmers", "active_at_end"):
                continue
            totals[k] += v
    totals["unique_swimmers"] = len(set().union(*swimmers.values())) if swimmers else 0
    totals["active_at_end"] = buckets[months[-1]]["active_at_end"]

    # --- balances as of today (positive = credit on account, negative = owes) ---
    bal_q = db.query(Member).filter(Member.credit_balance != 0)
    if member_filter:
        bal_q = bal_q.filter(Member.id.in_(member_filter))
    balances = [
        {
            "member_id": str(m.id),
            "name": f"{m.first_name} {m.last_name}".strip(),
            "balance": m.credit_balance,
            "owes": m.credit_balance < 0,
        }
        for m in bal_q.order_by(Member.credit_balance.asc()).all()
    ]
    for row in per_member.values():
        m = members.get(uuid.UUID(row["member_id"]))
        row["balance"] = m.credit_balance if m else ZERO

    # with a customer filter, list every selected member even if they did nothing
    for mid in member_filter:
        member_row(mid)

    return {
        "start": months[0],
        "end": months[-1],
        "months": [{"period": p, "label": month_label(p), **buckets[p]} for p in months],
        "totals": totals,
        "filter_members": [{"member_id": str(mid), "name": name_of(mid)} for mid in member_filter],
        "sales_by_plan": sorted(by_plan.values(), key=lambda p: p["amount"], reverse=True),
        "members": sorted(per_member.values(), key=lambda r: (r["total"], r["swims"]), reverse=True),
        "transactions": tx_items,
        "checkins": ci_items,
        "memberships_started": sorted(started, key=lambda e: e["valid_from"] or date.min, reverse=True),
        "memberships_expired": sorted(expired, key=lambda e: e["valid_until"] or date.min, reverse=True),
        "balances": balances,
        "timezone": str(local_tz),
    }


def get_report_bounds(db: Session) -> dict:
    """Earliest and latest month with any data, so the picker knows how far back to go."""
    local_tz = _local_tz(db)
    firsts = [
        db.query(func.min(Transaction.created_at)).scalar(),
        db.query(func.min(Checkin.checked_in_at)).scalar(),
        db.query(func.min(Membership.created_at)).scalar(),
    ]
    firsts = [f for f in firsts if f]
    today = datetime.now(local_tz)
    first = _period_of(local_tz, min(firsts)) if firsts else today.strftime("%Y-%m")
    return {"first_month": first, "last_month": today.strftime("%Y-%m")}
