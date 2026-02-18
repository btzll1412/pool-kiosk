import uuid
from decimal import Decimal

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.config import settings
from app.models.member import Member
from app.models.plan import Plan
from app.models.transaction import PaymentMethod, Transaction, TransactionType
from app.payments.base import BasePaymentAdapter
from app.payments.cash import CashPaymentAdapter
from app.payments.stub import StubPaymentAdapter
from app.services.membership_service import create_membership


def get_payment_adapter() -> BasePaymentAdapter:
    adapters = {
        "stub": StubPaymentAdapter,
        "cash": CashPaymentAdapter,
    }
    adapter_cls = adapters.get(settings.payment_adapter, StubPaymentAdapter)
    return adapter_cls()


def process_cash_payment(
    db: Session,
    member_id: uuid.UUID,
    plan_id: uuid.UUID,
    amount_tendered: Decimal,
) -> tuple[Transaction, Decimal, Decimal]:
    member = db.query(Member).filter(Member.id == member_id).first()
    if not member:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Member not found")

    plan = db.query(Plan).filter(Plan.id == plan_id).first()
    if not plan:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Plan not found")

    if amount_tendered < plan.price:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Insufficient amount. Plan costs ${plan.price}, received ${amount_tendered}",
        )

    overpayment = amount_tendered - plan.price
    change_due = Decimal("0.00")
    credit_added = Decimal("0.00")

    if overpayment > 0:
        credit_added = overpayment
        member.credit_balance += credit_added

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
    return tx
