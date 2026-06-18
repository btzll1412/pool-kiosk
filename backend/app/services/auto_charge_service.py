import logging
import uuid
from datetime import date, timedelta
from calendar import monthrange
from decimal import Decimal

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.member import Member
from app.models.plan import Plan, PlanType
from app.models.saved_card import SavedCard
from app.models.transaction import PaymentMethod, Transaction, TransactionType
from app.services.membership_service import create_membership
from app.services.notification_service import notify_auto_charge_failed, notify_auto_charge_success
from app.services.payment_service import get_payment_adapter

logger = logging.getLogger(__name__)


def _get_first_of_next_month(from_date: date = None) -> date:
    """Calculate the 1st of the next month from the given date."""
    if from_date is None:
        from_date = date.today()

    if from_date.month == 12:
        return date(from_date.year + 1, 1, 1)
    else:
        return date(from_date.year, from_date.month + 1, 1)


def _get_next_billing_date(from_date: date = None, billing_day: int = None) -> date:
    """Calculate the next billing date based on a custom billing day.

    If billing_day is None or 1, falls back to 1st of next month.
    billing_day is clamped to 1-28 to avoid month-length issues.
    """
    from calendar import monthrange

    if from_date is None:
        from_date = date.today()

    if not billing_day or billing_day <= 1:
        return _get_first_of_next_month(from_date)

    billing_day = min(billing_day, 28)

    # If we haven't passed the billing day this month, use this month
    if from_date.day < billing_day:
        last_day = monthrange(from_date.year, from_date.month)[1]
        return date(from_date.year, from_date.month, min(billing_day, last_day))

    # Otherwise, use next month
    next_year = from_date.year + 1 if from_date.month == 12 else from_date.year
    next_month = 1 if from_date.month == 12 else from_date.month + 1
    last_day = monthrange(next_year, next_month)[1]
    return date(next_year, next_month, min(billing_day, last_day))


def process_due_charges(db: Session) -> dict:
    """Find all saved cards with auto-charge due today or earlier and charge them."""
    today = date.today()
    due_cards = (
        db.query(SavedCard)
        .filter(
            SavedCard.auto_charge_enabled.is_(True),
            SavedCard.next_charge_date <= today,
            SavedCard.auto_charge_plan_id.isnot(None),
        )
        .all()
    )

    results = {"processed": 0, "succeeded": 0, "failed": 0}
    adapter = get_payment_adapter(db)

    for card in due_cards:
        results["processed"] += 1
        plan = db.query(Plan).filter(Plan.id == card.auto_charge_plan_id).first()
        if not plan:
            logger.warning("Auto-charge skipped: plan %s not found for card %s", card.auto_charge_plan_id, card.id)
            member = db.query(Member).filter(Member.id == card.member_id).first()
            if member:
                notify_auto_charge_failed(
                    db, member_name=f"{member.first_name} {member.last_name}",
                    member_id=str(card.member_id), plan_name="Unknown",
                    amount="0.00", card_last4=card.card_last4 or "", reason="Plan not found",
                )
            results["failed"] += 1
            continue

        member = db.query(Member).filter(Member.id == card.member_id, Member.is_active.is_(True)).first()
        if not member:
            logger.warning("Auto-charge skipped: member %s inactive for card %s", card.member_id, card.id)
            notify_auto_charge_failed(
                db, member_name=str(card.member_id),
                member_id=str(card.member_id), plan_name=plan.name,
                amount=str(plan.price), card_last4=card.card_last4 or "", reason="Member inactive",
            )
            results["failed"] += 1
            continue

        customer_name = f"{member.first_name} {member.last_name}"
        plan_price = plan.price
        credit_used = Decimal("0.00")
        card_charge_amount = plan_price

        # Prevent double-charge: move next_charge_date forward BEFORE charging
        original_charge_date = card.next_charge_date
        card.next_charge_date = _get_next_billing_date(today, card.billing_day)
        db.commit()

        # Check if member has account credit to apply
        if member.credit_balance and member.credit_balance > 0:
            if member.credit_balance >= plan_price:
                credit_used = plan_price
                card_charge_amount = Decimal("0.00")
            else:
                credit_used = member.credit_balance
                card_charge_amount = plan_price - credit_used

        # Charge card if needed
        charge_result = None
        if card_charge_amount > 0:
            charge_result = adapter.charge_saved_card(
                token=card.processor_token,
                amount=card_charge_amount,
                member_id=str(card.member_id),
                description=f"Auto-charge: {plan.name}" + (f" (${credit_used} credit applied)" if credit_used > 0 else ""),
                customer_name=customer_name,
            )

            if not charge_result.success:
                # Charge failed — restore original charge date so it retries next run
                card.next_charge_date = original_charge_date
                db.commit()
                logger.warning("Auto-charge failed for card %s: %s", card.id, charge_result.message)
                notify_auto_charge_failed(
                    db, member_name=f"{member.first_name} {member.last_name}",
                    member_id=str(card.member_id), plan_name=plan.name,
                    amount=str(card_charge_amount), card_last4=card.card_last4 or "",
                    reason=charge_result.message or "Charge declined",
                )
                results["failed"] += 1
                continue

        # Create membership and record transactions — wrapped in try/catch
        try:
            membership = create_membership(db, card.member_id, plan.id, billing_day=card.billing_day)

            # Deduct credit if used
            if credit_used > 0:
                member.credit_balance -= credit_used
                credit_tx = Transaction(
                    member_id=card.member_id,
                    transaction_type=TransactionType.credit_use,
                    payment_method=PaymentMethod.credit,
                    amount=credit_used,
                    plan_id=plan.id,
                    membership_id=membership.id,
                    notes=f"Auto-charge: credit applied for {plan.name}",
                )
                db.add(credit_tx)

            # Record card payment transaction if charged
            if card_charge_amount > 0 and charge_result:
                tx = Transaction(
                    member_id=card.member_id,
                    transaction_type=TransactionType.payment,
                    payment_method=PaymentMethod.card,
                    amount=card_charge_amount,
                    plan_id=plan.id,
                    membership_id=membership.id,
                    saved_card_id=card.id,
                    reference_id=charge_result.reference_id,
                    notes=f"Auto-charge" + (f" (${credit_used} credit also applied)" if credit_used > 0 else ""),
                )
                db.add(tx)

            db.commit()
        except Exception as e:
            db.rollback()
            logger.error("Auto-charge: membership creation failed after successful charge for card %s: %s", card.id, e)
            # Restore charge date so it retries
            card.next_charge_date = original_charge_date
            db.commit()
            results["failed"] += 1
            continue

        # Log success with credit info
        if credit_used > 0 and card_charge_amount > 0:
            logger.info("Auto-charge succeeded for member %s, plan %s: $%s credit + $%s card",
                       card.member_id, plan.name, credit_used, card_charge_amount)
        elif credit_used > 0:
            logger.info("Auto-charge succeeded for member %s, plan %s: $%s credit only (no card charge)",
                       card.member_id, plan.name, credit_used)
        else:
            logger.info("Auto-charge succeeded for member %s, plan %s: $%s card",
                       card.member_id, plan.name, card_charge_amount)

        member_name = f"{member.first_name} {member.last_name}"
        # Build amount string for notification
        if credit_used > 0 and card_charge_amount > 0:
            amount_str = f"${card_charge_amount} charged (${credit_used} credit applied)"
        elif credit_used > 0:
            amount_str = f"${credit_used} credit used (no card charge)"
        else:
            amount_str = str(plan.price)
        notify_auto_charge_success(
            db, member_name=member_name,
            member_id=str(card.member_id), plan_name=plan.name,
            amount=amount_str, card_last4=card.card_last4 or "",
        )
        if member.email:
            from app.services.email_service import send_auto_charge_receipt
            send_auto_charge_receipt(
                db, member.email, member_name, plan.name,
                str(plan.price), card.card_last4 or "",
            )
        results["succeeded"] += 1

    return results


def enable_auto_charge(
    db: Session, saved_card_id: uuid.UUID, plan_id: uuid.UUID, member_id: uuid.UUID,
    billing_day: int = None,
) -> SavedCard:
    """Enable auto-charge on a saved card for a monthly or swim pass plan."""
    card = db.query(SavedCard).filter(
        SavedCard.id == saved_card_id, SavedCard.member_id == member_id
    ).first()
    if not card:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Saved card not found")

    plan = db.query(Plan).filter(Plan.id == plan_id, Plan.is_active.is_(True)).first()
    if not plan:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Plan not found")
    if plan.plan_type not in (PlanType.monthly, PlanType.swim_pass):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Auto-charge is only available for monthly and swim pass plans",
        )

    # Disable auto-charge on other cards for this member
    db.query(SavedCard).filter(
        SavedCard.member_id == member_id,
        SavedCard.auto_charge_enabled.is_(True),
        SavedCard.id != saved_card_id,
    ).update({"auto_charge_enabled": False, "auto_charge_plan_id": None, "next_charge_date": None})

    card.auto_charge_enabled = True
    card.auto_charge_plan_id = plan.id
    card.billing_day = billing_day if billing_day and 1 <= billing_day <= 28 else None
    # Monthly plans charge on billing day; swim pass plans charge when depleted (no date needed)
    if plan.plan_type == PlanType.monthly:
        card.next_charge_date = _get_next_billing_date(billing_day=card.billing_day)
    else:
        card.next_charge_date = None  # Swim pass auto-recharge triggers on depletion

    db.commit()
    db.refresh(card)
    return card


def disable_auto_charge(
    db: Session, saved_card_id: uuid.UUID, member_id: uuid.UUID
) -> SavedCard:
    """Disable auto-charge on a saved card."""
    card = db.query(SavedCard).filter(
        SavedCard.id == saved_card_id, SavedCard.member_id == member_id
    ).first()
    if not card:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Saved card not found")

    card.auto_charge_enabled = False
    card.auto_charge_plan_id = None
    card.next_charge_date = None

    db.commit()
    db.refresh(card)
    return card


def auto_recharge_swim_pass(db: Session, member_id: uuid.UUID) -> tuple[bool, str]:
    """
    Check if member has auto-recharge enabled for a swim pass and charge if so.
    Returns (success, message) tuple.
    Called when a swim pass is depleted during check-in.
    """
    # Find a saved card with auto-charge enabled for a swim pass plan
    card = (
        db.query(SavedCard)
        .join(Plan, SavedCard.auto_charge_plan_id == Plan.id)
        .filter(
            SavedCard.member_id == member_id,
            SavedCard.auto_charge_enabled.is_(True),
            Plan.plan_type == PlanType.swim_pass,
            Plan.is_active.is_(True),
        )
        .first()
    )

    if not card:
        return False, "No auto-recharge configured"

    plan = db.query(Plan).filter(Plan.id == card.auto_charge_plan_id).first()
    if not plan:
        return False, "Auto-recharge plan not found"

    member = db.query(Member).filter(Member.id == member_id).first()
    if not member:
        return False, "Member not found"

    customer_name = f"{member.first_name} {member.last_name}"

    adapter = get_payment_adapter(db)
    charge_result = adapter.charge_saved_card(
        token=card.processor_token,
        amount=plan.price,
        member_id=str(member_id),
        description=f"Auto-recharge: {plan.name}",
        customer_name=customer_name,
    )

    if not charge_result.success:
        logger.warning("Auto-recharge failed for member %s: %s", member_id, charge_result.message)
        notify_auto_charge_failed(
            db, member_name=customer_name,
            member_id=str(member_id), plan_name=plan.name,
            amount=str(plan.price), card_last4=card.card_last4 or "",
            reason=charge_result.message or "Charge declined",
        )
        return False, charge_result.message or "Card charge failed"

    # Create new membership
    membership = create_membership(db, member_id, plan.id)

    # Record transaction
    tx = Transaction(
        member_id=member_id,
        transaction_type=TransactionType.payment,
        payment_method=PaymentMethod.card,
        amount=plan.price,
        plan_id=plan.id,
        membership_id=membership.id,
        saved_card_id=card.id,
        reference_id=charge_result.reference_id,
        notes="Auto-recharge (swim pass depleted)",
    )
    db.add(tx)
    db.commit()

    logger.info("Auto-recharge succeeded for member %s, plan %s", member_id, plan.name)
    notify_auto_charge_success(
        db, member_name=customer_name,
        member_id=str(member_id), plan_name=plan.name,
        amount=str(plan.price), card_last4=card.card_last4 or "",
    )

    if member.email:
        from app.services.email_service import send_auto_charge_receipt
        send_auto_charge_receipt(
            db, member.email, customer_name, plan.name,
            str(plan.price), card.card_last4 or "",
        )

    return True, f"Auto-recharged {plan.name} - ${plan.price}"


def charge_saved_card_now(
    db: Session, saved_card_id: uuid.UUID, plan_id: uuid.UUID, member_id: uuid.UUID,
    amount_override: "Decimal | None" = None, start_date: "date | None" = None, billing_day: int = None,
) -> Transaction:
    """Charge a saved card on-demand for a kiosk payment."""
    card = db.query(SavedCard).filter(
        SavedCard.id == saved_card_id, SavedCard.member_id == member_id
    ).first()
    if not card:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Saved card not found")

    plan = db.query(Plan).filter(Plan.id == plan_id).first()
    if not plan:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Plan not found")

    charge_amount = amount_override if amount_override is not None else plan.price

    member = db.query(Member).filter(Member.id == member_id).first()
    customer_name = f"{member.first_name} {member.last_name}" if member else None

    adapter = get_payment_adapter(db)
    charge_result = adapter.charge_saved_card(
        token=card.processor_token,
        amount=charge_amount,
        member_id=str(member_id),
        description=f"Purchase: {plan.name}",
        customer_name=customer_name,
    )

    if not charge_result.success:
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail=charge_result.message or "Card charge failed",
        )

    # Use explicitly passed billing_day, or fall back to card's billing_day
    effective_billing_day = billing_day or (card.billing_day if hasattr(card, 'billing_day') else None)
    membership = create_membership(db, member_id, plan_id, start_date=start_date, billing_day=effective_billing_day)

    tx = Transaction(
        member_id=member_id,
        transaction_type=TransactionType.payment,
        payment_method=PaymentMethod.card,
        amount=charge_amount,
        plan_id=plan.id,
        membership_id=membership.id,
        saved_card_id=card.id,
        reference_id=charge_result.reference_id,
    )
    db.add(tx)
    db.commit()
    db.refresh(tx)
    return tx
