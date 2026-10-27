"""
Item plans: one-time sales of things that are not memberships (snacks, towels,
lessons, ...). They sit next to the real plans at the kiosk and in the admin panel
and are paid the same way, but a sale creates nothing — only a transaction that
says what it was for.

Two kinds:
* fixed price   — the plan price (member price overrides apply as for any plan)
* open amount   — the buyer types the amount, within the plan's min/max if set

Every item sale needs a description ("what is this charge for?").
"""
import re
from decimal import Decimal, InvalidOperation

from fastapi import HTTPException, status

from app.models.plan import Plan, PlanType

DESCRIPTION_MAX_LEN = 200
_CENT = Decimal("0.01")


def is_item_plan(plan: Plan | None) -> bool:
    return plan is not None and plan.plan_type == PlanType.item


def _bad_request(detail: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=detail)


def clean_description(description: str | None) -> str:
    text = (description or "").strip()
    if not text:
        raise _bad_request("Please enter what this charge is for")
    if len(text) > DESCRIPTION_MAX_LEN:
        raise _bad_request(f"Description must be {DESCRIPTION_MAX_LEN} characters or less")
    return text


def resolve_item_amount(plan: Plan, amount: Decimal | str | None, list_price: Decimal | None = None) -> Decimal:
    """The amount due for an item sale.

    ``list_price`` is the fixed price to use (member price override already applied);
    defaults to the plan price. Open-amount plans require ``amount`` within min/max.
    """
    if not plan.open_amount:
        return Decimal(list_price if list_price is not None else plan.price).quantize(_CENT)

    if amount is None or amount == "":
        raise _bad_request("Please enter an amount")
    try:
        value = Decimal(str(amount)).quantize(_CENT)
    except (InvalidOperation, ValueError):
        raise _bad_request("Please enter a valid amount")
    if value <= 0:
        raise _bad_request("Amount must be more than zero")
    if plan.min_amount is not None and value < plan.min_amount:
        raise _bad_request(f"The minimum for {plan.name} is ${plan.min_amount:.2f}")
    if plan.max_amount is not None and value > plan.max_amount:
        raise _bad_request(f"The maximum for {plan.name} is ${plan.max_amount:.2f}")
    return value


def validate_item_plan_fields(
    plan_type: PlanType,
    open_amount: bool,
    min_amount: Decimal | None,
    max_amount: Decimal | None,
    price: Decimal | None,
) -> None:
    """Rules an admin must follow when saving a plan (raises 400 on a bad combination)."""
    if plan_type != PlanType.item:
        if open_amount or min_amount is not None or max_amount is not None:
            raise _bad_request("Only item plans can have an open amount or min/max limits")
        return
    if open_amount:
        if min_amount is not None and min_amount < 0:
            raise _bad_request("Minimum amount cannot be negative")
        if max_amount is not None and max_amount <= 0:
            raise _bad_request("Maximum amount must be more than zero")
        if min_amount is not None and max_amount is not None and min_amount > max_amount:
            raise _bad_request("Minimum amount cannot be more than the maximum")
    else:
        if min_amount is not None or max_amount is not None:
            raise _bad_request("Min/max limits only apply to open-amount items")
        if price is None or price <= 0:
            raise _bad_request("A fixed-price item needs a price above zero")


def sale_note(description: str | None, base: str | None = None) -> str | None:
    """Transaction note for a sale: the item description first, then any payment detail."""
    if not description:
        return base
    return f"{description} — {base}" if base else description


# --- Item Sales page -------------------------------------------------------------
#
# Every item sale is a payment transaction on an item plan. A split payment (cash +
# card, or credit + card) is several transactions linked through
# related_transaction_id to the first part. The page shows one row per sale.

import uuid
from datetime import date, datetime

import pytz
from sqlalchemy import func, or_
from sqlalchemy.orm import Session, joinedload

from app.models.member import Member
from app.models.transaction import PaymentMethod, Transaction, TransactionType
from app.services.settings_service import get_setting

METHOD_FILTERS = ("cash", "card", "credit", "account", "split")
BUYER_FILTERS = ("member", "guest")


def part_method(tx: Transaction) -> str:
    """cash / card / credit / account for one transaction."""
    if tx.payment_method == PaymentMethod.cash:
        return "cash"
    if tx.payment_method == PaymentMethod.card:
        return "card"
    if tx.payment_method == PaymentMethod.credit:
        return "account" if (tx.notes and "Charged to account" in tx.notes) else "credit"
    return tx.payment_method.value if tx.payment_method else "manual"


def description_of(tx: Transaction) -> str | None:
    """The item description: sale_note() puts it first, before ' — '."""
    if not tx.notes:
        return None
    return tx.notes.split(" — ", 1)[0].strip() or None


def card_last4_of(tx: Transaction) -> str | None:
    if tx.saved_card and tx.saved_card.card_last4:
        return tx.saved_card.card_last4
    if tx.notes:
        m = re.search(r"\*{4}(\d{4})", tx.notes)
        if m:
            return m.group(1)
    return None


def _local_tz(db: Session):
    try:
        return pytz.timezone(get_setting(db, "timezone", "America/New_York"))
    except pytz.UnknownTimeZoneError:
        return pytz.timezone("America/New_York")


def _utc(local_tz, day: date, end: bool) -> datetime:
    local = local_tz.localize(datetime.combine(day, datetime.max.time() if end else datetime.min.time()))
    return local.astimezone(pytz.UTC).replace(tzinfo=None)


def _digits(column):
    """Phone column with the usual separators stripped, so '8455550001' finds '(845) 555-0001'."""
    expr = column
    for ch in ("-", " ", "(", ")", ".", "+"):
        expr = func.replace(expr, ch, "")
    return expr


def _item_payments(db: Session):
    return (
        db.query(Transaction)
        .join(Plan, Plan.id == Transaction.plan_id)
        .filter(Plan.plan_type == PlanType.item, Transaction.transaction_type == TransactionType.payment)
    )


def _primary_sales(db: Session, start: date | None, end: date | None, search: str | None,
                   plan_id: uuid.UUID | None, method: str | None, buyer: str | None):
    """Query of the first transaction of every matching sale."""
    q = _item_payments(db).filter(Transaction.related_transaction_id.is_(None))
    tz = _local_tz(db)
    if start:
        q = q.filter(Transaction.created_at >= _utc(tz, start, end=False))
    if end:
        q = q.filter(Transaction.created_at <= _utc(tz, end, end=True))
    if plan_id:
        q = q.filter(Transaction.plan_id == plan_id)
    if buyer == "member":
        q = q.filter(Transaction.member_id.isnot(None))
    elif buyer == "guest":
        q = q.filter(Transaction.member_id.is_(None))
    if search:
        like = f"%{search.strip()}%"
        digits = re.sub(r"\D", "", search)
        q = q.outerjoin(Member, Member.id == Transaction.member_id).filter(or_(
            Transaction.guest_name.ilike(like),
            Transaction.notes.ilike(like),
            Member.first_name.ilike(like),
            Member.last_name.ilike(like),
            (Member.first_name + " " + Member.last_name).ilike(like),
            *( [_digits(Transaction.phone).like(f"%{digits}%"), _digits(Member.phone).like(f"%{digits}%")] if digits else [] ),
        ))
    if method:
        # A sale matches when any of its parts was paid that way (or it has several parts).
        parts = _item_payments(db).with_entities(
            Transaction.id, Transaction.related_transaction_id, Transaction.payment_method, Transaction.notes
        ).all()
        groups: dict[uuid.UUID, list] = {}
        for pid, rel, pm, notes in parts:
            groups.setdefault(rel or pid, []).append((pm, notes))
        def part_kind(pm, notes):
            if pm == PaymentMethod.credit:
                return "account" if (notes and "Charged to account" in notes) else "credit"
            return pm.value if pm else "manual"
        if method == "split":
            ids = [g for g, ps in groups.items() if len(ps) > 1]
        else:
            ids = [g for g, ps in groups.items() if any(part_kind(pm, n) == method for pm, n in ps)]
        q = q.filter(Transaction.id.in_(ids or [uuid.uuid4()]))
    return q


def _parts_for(db: Session, primaries: list[Transaction]) -> dict[uuid.UUID, list[Transaction]]:
    if not primaries:
        return {}
    children = (
        db.query(Transaction)
        .filter(Transaction.related_transaction_id.in_([p.id for p in primaries]),
                Transaction.transaction_type == TransactionType.payment)
        .order_by(Transaction.created_at)
        .all()
    )
    out = {p.id: [p] for p in primaries}
    for c in children:
        out[c.related_transaction_id].append(c)
    return out


def sale_row(primary: Transaction, parts: list[Transaction]) -> dict:
    member = primary.member
    total = sum((p.amount for p in parts), Decimal("0.00"))
    part_rows = []
    for p in parts:
        kind = part_method(p)
        last4 = card_last4_of(p) if kind == "card" else None
        part_rows.append({"method": kind, "amount": str(p.amount), "card_last4": last4})
    if len(part_rows) == 1:
        label = part_rows[0]["method"] + (f" ****{part_rows[0]['card_last4']}" if part_rows[0]["card_last4"] else "")
    else:
        label = "split: " + " + ".join(
            f"{r['method']} ${Decimal(r['amount']):.2f}" + (f" ****{r['card_last4']}" if r["card_last4"] else "")
            for r in part_rows
        )
    return {
        "id": str(primary.id),
        "created_at": primary.created_at.isoformat(),
        "buyer": "member" if member else "guest",
        "member_id": str(member.id) if member else None,
        "name": f"{member.first_name} {member.last_name}" if member else (primary.guest_name or "Guest"),
        "phone": member.phone if member else primary.phone,
        "plan_id": str(primary.plan_id) if primary.plan_id else None,
        "plan_name": primary.plan.name if primary.plan else None,
        "description": description_of(primary),
        "amount": str(total),
        "method": part_rows[0]["method"] if len(part_rows) == 1 else "split",
        "method_label": label,
        "parts": part_rows,
        "recorded_by": primary.creator.username if primary.creator else "kiosk",
        "notes": primary.notes,
    }


def list_item_sales(db: Session, *, start: date | None = None, end: date | None = None, search: str | None = None,
                    plan_id: uuid.UUID | None = None, method: str | None = None, buyer: str | None = None,
                    page: int = 1, per_page: int = 25) -> dict:
    q = _primary_sales(db, start, end, search, plan_id, method, buyer)
    total = q.count()
    primaries = (
        q.options(joinedload(Transaction.member), joinedload(Transaction.creator))
        .order_by(Transaction.created_at.desc())
        .offset((page - 1) * per_page).limit(per_page).all()
    )
    parts = _parts_for(db, primaries)
    items = [sale_row(p, parts[p.id]) for p in primaries]

    # Summary over everything that matches the filters, not just this page
    all_primaries = q.all()
    all_parts = _parts_for(db, all_primaries)
    by_method = {k: Decimal("0.00") for k in ("cash", "card", "credit", "account")}
    grand = Decimal("0.00")
    for plist in all_parts.values():
        for p in plist:
            kind = part_method(p)
            by_method[kind] = by_method.get(kind, Decimal("0.00")) + p.amount
            grand += p.amount
    return {
        "items": items,
        "total": total,
        "page": page,
        "per_page": per_page,
        "summary": {"count": total, "amount": str(grand), **{k: str(v) for k, v in by_method.items()}},
    }


def all_item_sales(db: Session, **filters) -> list[dict]:
    """Every matching sale, newest first (for CSV export)."""
    q = _primary_sales(db, filters.get("start"), filters.get("end"), filters.get("search"),
                       filters.get("plan_id"), filters.get("method"), filters.get("buyer"))
    primaries = (
        q.options(joinedload(Transaction.member), joinedload(Transaction.creator))
        .order_by(Transaction.created_at.desc()).all()
    )
    parts = _parts_for(db, primaries)
    return [sale_row(p, parts[p.id]) for p in primaries]


def item_plans_for_filter(db: Session) -> list[dict]:
    """Item plans including archived ones, so old sales stay filterable."""
    plans = db.query(Plan).filter(Plan.plan_type == PlanType.item).order_by(Plan.deleted_at.isnot(None), Plan.name).all()
    return [{"id": str(p.id), "name": p.name, "archived": p.deleted_at is not None} for p in plans]
