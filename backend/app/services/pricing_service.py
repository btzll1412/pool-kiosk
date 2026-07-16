import logging
import uuid
from decimal import Decimal

from sqlalchemy.orm import Session

from app.models.member_price_override import MemberPriceOverride
from app.models.plan import Plan

logger = logging.getLogger(__name__)


def get_member_price(db: Session, member_id: uuid.UUID, plan_id: uuid.UUID) -> Decimal:
    """Get the effective price for a member+plan. Returns custom price if set, otherwise plan price."""
    override = db.query(MemberPriceOverride).filter(
        MemberPriceOverride.member_id == member_id,
        MemberPriceOverride.plan_id == plan_id,
    ).first()
    if override:
        return override.custom_price

    plan = db.query(Plan).filter(Plan.id == plan_id).first()
    return plan.price if plan else Decimal("0.00")


def get_member_price_overrides(db: Session, member_id: uuid.UUID) -> dict:
    """Get all price overrides for a member as {plan_id: custom_price}."""
    overrides = db.query(MemberPriceOverride).filter(
        MemberPriceOverride.member_id == member_id,
    ).all()
    return {str(o.plan_id): o.custom_price for o in overrides}
