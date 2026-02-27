import logging
import uuid
from datetime import date, timedelta

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
        charge_result = adapter.charge_saved_card(
            token=card.processor_token,
            amount=plan.price,
            member_id=str(card.member_id),
            description=f"Auto-charge: {plan.name}",
            customer_name=customer_name,
        )

        if not charge_result.success:
            logger.warning("Auto-charge failed for card %s: %s", card.id, charge_result.message)
            notify_auto_charge_failed(
                db, member_name=f"{member.first_name} {member.last_name}",
                member_id=str(card.member_id), plan_name=plan.name,
                amount=str(plan.price), card_last4=card.card_last4 or "",
                reason=charge_result.message or "Charge declined",
            )
            results["failed"] += 1
            continue

        membership = create_membership(db, card.member_id, plan.id)

        tx = Transaction(
            member_id=card.member_id,
            transaction_type=TransactionType.payment,
            payment_method=PaymentMethod.card,
            amount=plan.price,
            plan_id=plan.id,
            membership_id=membership.id,
            saved_card_id=card.id,
            reference_id=charge_result.reference_id,
            notes="Auto-charge",
        )
        db.add(tx)

        card.next_charge_date = today + timedelta(days=plan.duration_days or 30)
        db.commit()

        logger.info("Auto-charge succeeded for member %s, plan %s", card.member_id, plan.name)
        member_name = f"{member.first_name} {member.last_name}"
        notify_auto_charge_success(
            db, member_name=member_name,
            member_id=str(card.member_id), plan_name=plan.name,
            amount=str(plan.price), card_last4=card.card_last4 or "",
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
    db: Session, saved_card_id: uuid.UUID, plan_id: uuid.UUID, member_id: uuid.UUID
) -> SavedCard:
    """Enable auto-charge on a saved card for a specific monthly plan."""
    card = db.query(SavedCard).filter(
        SavedCard.id == saved_card_id, SavedCard.member_id == member_id
    ).first()
    if not card:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Saved card not found")

    plan = db.query(Plan).filter(Plan.id == plan_id, Plan.is_active.is_(True)).first()
    if not plan:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Plan not found")
    if plan.plan_type != PlanType.monthly:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Auto-charge is only available for monthly plans",
        )

    # Disable auto-charge on other cards for this member
    db.query(SavedCard).filter(
        SavedCard.member_id == member_id,
        SavedCard.auto_charge_enabled.is_(True),
        SavedCard.id != saved_card_id,
    ).update({"auto_charge_enabled": False, "auto_charge_plan_id": None, "next_charge_date": None})

    card.auto_charge_enabled = True
    card.auto_charge_plan_id = plan.id
    card.next_charge_date = date.today() + timedelta(days=plan.duration_days or 30)

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


def charge_saved_card_now(
    db: Session, saved_card_id: uuid.UUID, plan_id: uuid.UUID, member_id: uuid.UUID
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

    member = db.query(Member).filter(Member.id == member_id).first()
    customer_name = f"{member.first_name} {member.last_name}" if member else None

    adapter = get_payment_adapter(db)
    charge_result = adapter.charge_saved_card(
        token=card.processor_token,
        amount=plan.price,
        member_id=str(member_id),
        description=f"Purchase: {plan.name}",
        customer_name=customer_name,
    )

    if not charge_result.success:
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail=charge_result.message or "Card charge failed",
        )

    membership = create_membership(db, member_id, plan_id)

    tx = Transaction(
        member_id=member_id,
        transaction_type=TransactionType.payment,
        payment_method=PaymentMethod.card,
        amount=plan.price,
        plan_id=plan.id,
        membership_id=membership.id,
        saved_card_id=card.id,
        reference_id=charge_result.reference_id,
    )
    db.add(tx)
    db.commit()
    db.refresh(tx)
    return tx
