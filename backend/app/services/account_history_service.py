"""Member-facing account history for the kiosk ("My History").

Read-only. Everything returned is about ONE member and is meant to be shown to that member
after PIN verification, so internal fields (admin notes, processor tokens, who created a
transaction) are deliberately left out.
"""
from __future__ import annotations

import logging
import uuid
from datetime import date, datetime
from decimal import Decimal

import pytz
from sqlalchemy.orm import Session, selectinload

from app.models.checkin import Checkin, CheckinType
from app.models.membership import Membership
from app.models.membership_freeze import MembershipFreeze
from app.models.plan import Plan
from app.models.saved_card import SavedCard
from app.models.transaction import PaymentMethod, Transaction, TransactionType
from app.services.perf_log import StepTimer
from app.services.pricing_service import get_member_price
from app.services.time_service import local_today, local_tz

logger = logging.getLogger(__name__)

HISTORY_LIMIT = 50

_CHECKIN_LABELS = {
    CheckinType.membership: "Membership",
    CheckinType.swim_pass: "Swim pass",
    CheckinType.paid_single: "Single swim",
    CheckinType.free: "Free visit",
}

_TX_LABELS = {
    TransactionType.payment: "Payment",
    TransactionType.refund: "Refund",
    TransactionType.credit_add: "Money added",
    TransactionType.credit_use: "Paid from balance",
    TransactionType.manual_adjustment: "Balance adjustment",
}


def _local(tz, value: datetime | None) -> str | None:
    """Stored UTC-naive timestamp -> local ISO string (no offset) for display."""
    if value is None:
        return None
    return pytz.UTC.localize(value).astimezone(tz).replace(tzinfo=None).isoformat(timespec="minutes")


def _membership_status(m: Membership, today: date, frozen_ids: set[uuid.UUID]) -> str:
    if m.id in frozen_ids and m.is_active:
        return "frozen"
    if m.valid_from and m.valid_from > today:
        return "upcoming"
    if not m.is_active or (m.valid_until and m.valid_until < today):
        return "ended"
    if m.swims_total is not None and (m.swims_total - (m.swims_used or 0)) <= 0:
        return "used_up"
    return "active"


_STATUS_ORDER = {"active": 0, "frozen": 1, "upcoming": 2, "used_up": 3, "ended": 4}


def build_account_history(db: Session, member_id: uuid.UUID) -> dict:
    tz = local_tz(db)
    today = local_today(db)
    perf = StepTimer("kiosk.account_history", member_id=member_id)

    # ---- Plans -------------------------------------------------------------------
    memberships = (
        db.query(Membership)
        .filter(Membership.member_id == member_id)
        .order_by(Membership.created_at.desc())
        .limit(HISTORY_LIMIT)
        .all()
    )
    frozen_ids = {
        row[0]
        for row in db.query(MembershipFreeze.membership_id)
        .filter(
            MembershipFreeze.membership_id.in_([m.id for m in memberships] or [uuid.uuid4()]),
            MembershipFreeze.freeze_start <= today,
            MembershipFreeze.freeze_end >= today,
        )
        .all()
    }
    plans = []
    for m in memberships:
        st = _membership_status(m, today, frozen_ids)
        plans.append({
            "id": str(m.id),
            "plan_name": m.plan.name if m.plan else m.plan_type.value.replace("_", " ").title(),
            "plan_type": m.plan_type.value,
            "status": st,
            "valid_from": m.valid_from.isoformat() if m.valid_from else None,
            "valid_until": m.valid_until.isoformat() if m.valid_until else None,
            "swims_total": m.swims_total,
            "swims_remaining": (m.swims_total - (m.swims_used or 0)) if m.swims_total is not None else None,
        })
    plans.sort(key=lambda p: (_STATUS_ORDER.get(p["status"], 9), p["valid_from"] or ""), reverse=False)
    perf.step("plans", rows=len(plans))

    # ---- Upcoming automatic charges --------------------------------------------
    upcoming_charges = []
    for card in db.query(SavedCard).filter(SavedCard.member_id == member_id, SavedCard.auto_charge_enabled.is_(True)).all():
        plan = db.query(Plan).filter(Plan.id == card.auto_charge_plan_id).first() if card.auto_charge_plan_id else None
        amount = None
        if plan is not None:
            try:
                amount = str(get_member_price(db, member_id, plan.id))
            except Exception:  # pricing must never break the history screen
                logger.exception("account_history: price lookup failed member=%s plan=%s", member_id, plan.id)
        upcoming_charges.append({
            "date": card.next_charge_date.isoformat() if card.next_charge_date else None,
            "plan_name": plan.name if plan else None,
            "amount": amount,
            "card": f"{card.card_brand or 'Card'} ending {card.card_last4}",
            "one_time": bool(card.charge_once),
        })
    upcoming_charges.sort(key=lambda c: c["date"] or "9999")
    perf.step("upcoming_charges", rows=len(upcoming_charges))

    # ---- Visits --------------------------------------------------------------------
    checkins = (
        db.query(Checkin)
        .options(selectinload(Checkin.membership))
        .filter(Checkin.member_id == member_id)
        .order_by(Checkin.checked_in_at.desc())
        .limit(HISTORY_LIMIT)
        .all()
    )
    visits = [{
        "at": _local(tz, c.checked_in_at),
        "type": _CHECKIN_LABELS.get(c.checkin_type, c.checkin_type.value),
        "plan_name": c.membership.plan.name if c.membership is not None and c.membership.plan else None,
        "guests": c.guest_count or 0,
    } for c in checkins]

    month_start = today.replace(day=1)
    year_start = today.replace(month=1, day=1)
    def _utc_start(d: date) -> datetime:
        return tz.localize(datetime.combine(d, datetime.min.time())).astimezone(pytz.UTC).replace(tzinfo=None)
    visits_this_month = db.query(Checkin).filter(Checkin.member_id == member_id, Checkin.checked_in_at >= _utc_start(month_start)).count()
    visits_this_year = db.query(Checkin).filter(Checkin.member_id == member_id, Checkin.checked_in_at >= _utc_start(year_start)).count()
    perf.step("visits", rows=len(visits), month=visits_this_month, year=visits_this_year)

    # ---- Payments ------------------------------------------------------------------
    txs = (
        db.query(Transaction)
        .filter(Transaction.member_id == member_id)
        .order_by(Transaction.created_at.desc())
        .limit(HISTORY_LIMIT)
        .all()
    )
    payments = []
    for t in txs:
        if t.payment_method == PaymentMethod.card:
            how = f"{t.saved_card.card_brand or 'Card'} ending {t.saved_card.card_last4}" if t.saved_card else "Card"
        elif t.payment_method == PaymentMethod.cash:
            how = "Cash"
        elif t.payment_method == PaymentMethod.credit:
            how = "Account balance"
        else:
            how = "Front desk"
        payments.append({
            "at": _local(tz, t.created_at),
            "type": _TX_LABELS.get(t.transaction_type, t.transaction_type.value),
            "description": t.plan.name if t.plan else _TX_LABELS.get(t.transaction_type, ""),
            "amount": str(t.amount),
            "method": how,
            "is_refund": t.transaction_type == TransactionType.refund,
        })
    perf.step("payments", rows=len(payments))
    perf.__exit__(None, None, None)

    return {
        "plans": plans,
        "upcoming_charges": upcoming_charges,
        "visits": visits,
        "visits_this_month": visits_this_month,
        "visits_this_year": visits_this_year,
        "payments": payments,
        "limit": HISTORY_LIMIT,
    }
