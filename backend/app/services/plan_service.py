import logging
import uuid
from datetime import datetime

from sqlalchemy.orm import Session

from app.models.guest_visit import GuestVisit
from app.models.member_price_override import MemberPriceOverride
from app.models.membership import Membership
from app.models.pending_terminal_payment import PendingTerminalPayment
from app.models.plan import Plan
from app.models.saved_card import SavedCard
from app.models.transaction import Transaction
from app.services.report_service import is_membership_usable

logger = logging.getLogger(__name__)

# Everything that references a plan: (label shown to the admin, model, FK column)
_PLAN_REFERENCES = (
    ("membership(s)", Membership, Membership.plan_id),
    ("transaction(s)", Transaction, Transaction.plan_id),
    ("guest visit(s)", GuestVisit, GuestVisit.plan_id),
    ("custom member price(s)", MemberPriceOverride, MemberPriceOverride.plan_id),
    ("auto-charge card(s)", SavedCard, SavedCard.auto_charge_plan_id),
    ("pending terminal payment(s)", PendingTerminalPayment, PendingTerminalPayment.plan_id),
)


def get_plan_usage(db: Session, plan_id: uuid.UUID) -> dict[str, int]:
    """Count the records referencing a plan. Empty dict means nothing ever used it."""
    usage: dict[str, int] = {}
    for label, model, column in _PLAN_REFERENCES:
        count = db.query(model).filter(column == plan_id).count()
        if count:
            usage[label] = count
    return usage


def count_active_members(db: Session, plan_id: uuid.UUID) -> int:
    """Members currently on the plan: usable memberships (not expired, swims remaining)."""
    memberships = (
        db.query(Membership)
        .filter(Membership.plan_id == plan_id, Membership.is_active.is_(True))
        .all()
    )
    return sum(1 for m in memberships if is_membership_usable(m))


def delete_plan(db: Session, plan: Plan) -> bool:
    """Delete a plan. Only members actively on it block this (checked by the caller).

    A plan nothing ever used is erased. A plan with history is archived instead —
    hidden everywhere and never sold again, but kept so past memberships, payments
    and guest visits stay trackable. Returns True if archived, False if erased.
    """
    # Nothing may renew onto a deleted plan
    db.query(SavedCard).filter(SavedCard.auto_charge_plan_id == plan.id).update(
        {"auto_charge_enabled": False, "auto_charge_plan_id": None, "next_charge_date": None, "charge_once": False}
    )
    db.query(MemberPriceOverride).filter(MemberPriceOverride.plan_id == plan.id).delete()
    db.query(PendingTerminalPayment).filter(PendingTerminalPayment.plan_id == plan.id).delete()
    db.flush()

    archived = bool(get_plan_usage(db, plan.id))
    if archived:
        plan.is_active = False
        plan.deleted_at = datetime.utcnow()
    else:
        db.delete(plan)
    db.commit()
    logger.info("Plan %s: id=%s, name=%s", "archived" if archived else "erased", plan.id, plan.name)
    return archived
