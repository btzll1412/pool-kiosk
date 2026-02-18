import logging
import uuid
from decimal import Decimal

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

from app.config import settings
from app.models.member import Member
from app.models.plan import Plan
from app.models.transaction import PaymentMethod, Transaction, TransactionType
from app.payments.base import BasePaymentAdapter
from app.payments.cash import CashPaymentAdapter
from app.payments.stub import StubPaymentAdapter
from app.services.membership_service import create_membership
from app.services.notification_service import notify_low_balance
from app.services.settings_service import get_setting


def get_payment_adapter() -> BasePaymentAdapter:
    adapters = {
        "stub": StubPaymentAdapter,
        "cash": CashPaymentAdapter,
    }
    adapter_cls = adapters.get(settings.payment_adapter, StubPaymentAdapter)
    logger.debug("Using payment adapter: %s", adapter_cls.__name__)
    return adapter_cls()


def process_cash_payment(
    db: Session,
    member_id: uuid.UUID,
    plan_id: uuid.UUID,
    amount_tendered: Decimal,
    wants_change: bool = False,
) -> tuple[Transaction, Decimal, Decimal]:
    member = db.query(Member).filter(Member.id == member_id).first()
    if not member:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Member not found")

    plan = db.query(Plan).filter(Plan.id == plan_id).first()
    if not plan:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Plan not found")

    if amount_tendered < plan.price:
        logger.warning("Cash payment insufficient: member=%s, plan=%s, tendered=$%s, required=$%s", member_id, plan_id, amount_tendered, plan.price)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Insufficient amount. Plan costs ${plan.price}, received ${amount_tendered}",
        )

    overpayment = amount_tendered - plan.price
    change_due = Decimal("0.00")
    credit_added = Decimal("0.00")

    if overpayment > 0:
        if wants_change:
            change_due = overpayment
            logger.info("Cash payment overpay — change due: member=%s, change=$%s", member_id, change_due)
        else:
            credit_added = overpayment
            member.credit_balance += credit_added
            logger.info("Cash payment overpay — added to credit: member=%s, credit=$%s, new_balance=$%s", member_id, credit_added, member.credit_balance)

    membership = create_membership(db, member_id, plan_id)

    tx = Transaction(
        member_id=member_id,
        transaction_type=TransactionType.payment,
        payment_method=PaymentMethod.cash,
        amount=plan.price,
        plan_id=plan_id,
        membership_id=membership.id,
    )
    db.add(tx)

    if credit_added > 0:
        credit_tx = Transaction(
            member_id=member_id,
            transaction_type=TransactionType.credit_add,
            payment_method=PaymentMethod.cash,
            amount=credit_added,
            notes="Overpayment added as credit",
        )
        db.add(credit_tx)

    db.commit()
    db.refresh(tx)
    logger.info("Cash payment completed: member=%s, plan=%s, amount=$%s, tx=%s", member_id, plan.name, plan.price, tx.id)
    return tx, change_due, credit_added


def process_card_payment(
    db: Session,
    member_id: uuid.UUID,
    plan_id: uuid.UUID,
) -> Transaction:
    member = db.query(Member).filter(Member.id == member_id).first()
    if not member:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Member not found")

    plan = db.query(Plan).filter(Plan.id == plan_id).first()
    if not plan:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Plan not found")

    adapter = get_payment_adapter()
    session = adapter.initiate_payment(plan.price, str(member_id), f"Purchase: {plan.name}")
    logger.info("Card payment initiated: member=%s, plan=%s, amount=$%s, session=%s", member_id, plan.name, plan.price, session.session_id)

    membership = create_membership(db, member_id, plan_id)

    tx = Transaction(
        member_id=member_id,
        transaction_type=TransactionType.payment,
        payment_method=PaymentMethod.card,
        amount=plan.price,
        plan_id=plan_id,
        membership_id=membership.id,
        reference_id=session.session_id,
    )
    db.add(tx)
    db.commit()
    db.refresh(tx)
    logger.info("Card payment completed: member=%s, plan=%s, amount=$%s, tx=%s", member_id, plan.name, plan.price, tx.id)
    return tx


def process_credit_payment(
    db: Session,
    member_id: uuid.UUID,
    plan_id: uuid.UUID,
) -> Transaction | None:
    member = db.query(Member).filter(Member.id == member_id).first()
    if not member:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Member not found")

    plan = db.query(Plan).filter(Plan.id == plan_id).first()
    if not plan:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Plan not found")

    if member.credit_balance < plan.price:
        logger.info("Credit payment rejected — insufficient balance: member=%s, balance=$%s, required=$%s", member_id, member.credit_balance, plan.price)
        return None

    member.credit_balance -= plan.price
    membership = create_membership(db, member_id, plan_id)

    tx = Transaction(
        member_id=member_id,
        transaction_type=TransactionType.credit_use,
        payment_method=PaymentMethod.credit,
        amount=plan.price,
        plan_id=plan_id,
        membership_id=membership.id,
    )
    db.add(tx)
    db.commit()
    db.refresh(tx)
    logger.info("Credit payment completed: member=%s, plan=%s, amount=$%s, remaining=$%s", member_id, plan.name, plan.price, member.credit_balance)

    threshold = Decimal(get_setting(db, "low_balance_threshold", "5.00"))
    if member.credit_balance < threshold:
        logger.info("Low balance alert: member=%s, balance=$%s, threshold=$%s", member_id, member.credit_balance, threshold)
        notify_low_balance(
            db,
            member_name=f"{member.first_name} {member.last_name}",
            member_id=str(member.id),
            balance=str(member.credit_balance),
            threshold=str(threshold),
        )

    return tx
