"""Kiosk "Add Money": credit is added ONLY after a real payment step.

Before 2026-11-15 the kiosk credited any typed amount with no payment at all
(POST /kiosk/add-credit). Now every top-up goes through cash (cash-box honour system,
same as buying a plan with cash) or a card charge approved by the processor.

Recorded as a ``credit_add`` transaction (what admin top-ups and cash overpayments
already use, so reports keep treating it the same way) with the real payment method,
the member's description and, for cards, the processor reference.
"""
from __future__ import annotations

import logging
import uuid
from decimal import ROUND_HALF_UP, Decimal, InvalidOperation

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.member import Member
from app.models.saved_card import SavedCard
from app.models.transaction import PaymentMethod, Transaction, TransactionType
from app.services.activity_service import log_activity
from app.services.item_sale_service import clean_description
from app.services.payment_service import get_payment_adapter
from app.services.settings_service import get_setting

logger = logging.getLogger(__name__)

DEFAULT_MAX = Decimal("500.00")
DEFAULT_LIMIT_MESSAGE = "Amounts over {limit} can't be added at the kiosk. Please contact support."
CENT = Decimal("0.01")


def topup_limit(db: Session) -> Decimal:
    raw = get_setting(db, "kiosk_topup_max", str(DEFAULT_MAX))
    try:
        value = Decimal(str(raw).strip().lstrip("$")).quantize(CENT)
    except (InvalidOperation, ValueError):
        logger.warning("[TOPUP] bad kiosk_topup_max setting %r, using %s", raw, DEFAULT_MAX)
        return DEFAULT_MAX
    return value if value > 0 else DEFAULT_MAX


def limit_message(db: Session, limit: Decimal) -> str:
    template = get_setting(db, "kiosk_topup_limit_message", DEFAULT_LIMIT_MESSAGE) or DEFAULT_LIMIT_MESSAGE
    currency = get_setting(db, "currency_symbol", "$") or "$"
    return template.replace("{limit}", f"{currency}{limit:.2f}")


def validate_topup(db: Session, amount, description) -> tuple[Decimal, str]:
    """Amount (positive, cents, within the admin limit) and a required description."""
    try:
        value = Decimal(str(amount))
    except (InvalidOperation, ValueError, TypeError):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Please enter a valid amount")
    if not value.is_finite() or value <= 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Please enter a valid amount")
    if value != value.quantize(CENT):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Amount can't have more than 2 decimals")
    limit = topup_limit(db)
    if value > limit:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=limit_message(db, limit))
    return value.quantize(CENT), clean_description(description)


def _note(description: str, how: str) -> str:
    return f"Kiosk add money: {description} ({how})"


def _credit(db: Session, member: Member, amount: Decimal, method: PaymentMethod, description: str, how: str,
            reference_id: str | None = None, saved_card_id: uuid.UUID | None = None) -> Transaction:
    before = member.credit_balance
    member.credit_balance = (member.credit_balance or Decimal("0")) + amount
    tx = Transaction(
        member_id=member.id,
        transaction_type=TransactionType.credit_add,
        payment_method=method,
        amount=amount,
        saved_card_id=saved_card_id,
        reference_id=reference_id,
        notes=_note(description, how),
    )
    db.add(tx)
    db.flush()
    log_activity(
        db, None, "credit.kiosk_topup", "member", member.id,
        before={"credit_balance": str(before)},
        after={"credit_balance": str(member.credit_balance), "amount": str(amount), "method": method.value,
               "how": how, "reference_id": reference_id, "transaction_id": str(tx.id)},
        note=description,
    )
    db.commit()
    db.refresh(tx)
    logger.info("[TOPUP] OK member=%s amount=$%s method=%s how=%s ref=%s balance $%s -> $%s",
                member.id, amount, method.value, how, reference_id, before, member.credit_balance)
    return tx


def topup_cash(db: Session, member: Member, amount, description, amount_tendered) -> tuple[Transaction, Decimal]:
    """Cash into the box. Everything put in goes on the account (the kiosk gives no change)."""
    value, desc = validate_topup(db, amount, description)
    try:
        tendered = Decimal(str(amount_tendered)).quantize(CENT)
    except (InvalidOperation, ValueError, TypeError):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Please enter the cash amount")
    if not tendered.is_finite() or tendered < value:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Minimum ${value:.2f} required")
    limit = topup_limit(db)
    if tendered > limit:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=limit_message(db, limit))
    logger.info("[TOPUP] cash member=%s requested=$%s tendered=$%s", member.id, value, tendered)
    return _credit(db, member, tendered, PaymentMethod.cash, desc, "cash"), tendered


def topup_saved_card(db: Session, member: Member, amount, description, saved_card_id: uuid.UUID) -> Transaction:
    value, desc = validate_topup(db, amount, description)
    card = db.query(SavedCard).filter(SavedCard.id == saved_card_id, SavedCard.member_id == member.id).first()
    if not card:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Card not found")
    adapter = get_payment_adapter(db)
    logger.info("[TOPUP] card member=%s amount=$%s card=****%s", member.id, value, card.card_last4)
    result = adapter.charge_saved_card(
        token=card.processor_token, amount=value, member_id=str(member.id),
        description=f"Add money to account: {desc}", customer_name=f"{member.first_name} {member.last_name}",
    )
    if not result.success:
        logger.warning("[TOPUP] DECLINED member=%s amount=$%s card=****%s reason=%s", member.id, value, card.card_last4, result.message)
        raise HTTPException(status_code=status.HTTP_402_PAYMENT_REQUIRED, detail=result.message or "Card payment declined")
    how = f"{card.card_brand or 'Card'} ending {card.card_last4}"
    return _credit(db, member, value, PaymentMethod.card, desc, how, reference_id=result.reference_id, saved_card_id=card.id)


def _brand(card_number: str) -> str:
    if card_number.startswith("4"):
        return "Visa"
    if card_number.startswith("5"):
        return "Mastercard"
    if card_number.startswith(("34", "37")):
        return "Amex"
    if card_number.startswith("6"):
        return "Discover"
    return "Card"


def topup_manual_card(db: Session, member: Member, amount, description, card_number: str, exp_date: str,
                      cvv: str, save_card: bool) -> tuple[Transaction, bool]:
    from datetime import datetime

    value, desc = validate_topup(db, amount, description)
    number = (card_number or "").replace(" ", "").replace("-", "")
    if not number.isdigit() or not 13 <= len(number) <= 19:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid card number format")
    if not (exp_date or "").isdigit() or len(exp_date) != 4:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Expiration must be in MMYY format")
    month, year = int(exp_date[:2]), 2000 + int(exp_date[2:])
    now = datetime.now()
    if not 1 <= month <= 12:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid expiration month")
    if year < now.year or (year == now.year and month < now.month):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Card has expired")
    if not (cvv or "").isdigit() or not 3 <= len(cvv) <= 4:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="CVV must be 3-4 digits")
    adapter = get_payment_adapter(db)
    if not hasattr(adapter, "process_manual_card_sale"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Manual card entry not supported by current payment processor")
    last4 = number[-4:]
    logger.info("[TOPUP] new card member=%s amount=$%s card=****%s save=%s", member.id, value, last4, save_card)
    result = adapter.process_manual_card_sale(
        card_number=number, exp_date=exp_date, cvv=cvv, amount=value, member_id=str(member.id),
        description=f"Add money to account: {desc}", save_card=save_card,
        customer_name=f"{member.first_name} {member.last_name}",
    )
    if not result.success:
        logger.warning("[TOPUP] DECLINED member=%s amount=$%s card=****%s reason=%s", member.id, value, last4, result.message)
        raise HTTPException(status_code=status.HTTP_402_PAYMENT_REQUIRED, detail=result.message or "Card payment declined")
    brand = _brand(number)
    saved = None
    if save_card and result.card_token:
        saved = SavedCard(member_id=member.id, processor_token=result.card_token, card_last4=last4,
                          card_brand=brand, friendly_name=f"{brand} ending {last4}")
        db.add(saved)
        db.flush()
    tx = _credit(db, member, value, PaymentMethod.card, desc, f"{brand} ending {last4}",
                 reference_id=result.reference_id, saved_card_id=saved.id if saved else None)
    return tx, saved is not None
