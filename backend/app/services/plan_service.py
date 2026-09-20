import logging
import uuid

from sqlalchemy.orm import Session

from app.models.guest_visit import GuestVisit
from app.models.member_price_override import MemberPriceOverride
from app.models.membership import Membership
from app.models.pending_terminal_payment import PendingTerminalPayment
from app.models.saved_card import SavedCard
from app.models.transaction import Transaction

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
    """Count the records referencing a plan. Empty dict means it is safe to delete."""
    usage: dict[str, int] = {}
    for label, model, column in _PLAN_REFERENCES:
        count = db.query(model).filter(column == plan_id).count()
        if count:
            usage[label] = count
    return usage
