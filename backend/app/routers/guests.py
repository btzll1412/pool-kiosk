import logging
import uuid
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.guest_visit import GuestVisit
from app.models.transaction import Transaction, TransactionType, PaymentMethod
from app.models.user import User
from app.services.auth_service import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter()


class GiveChangeRequest(BaseModel):
    amount: Decimal


@router.get("")
def list_guests(
    page: int = Query(1, ge=1),
    per_page: int = Query(25, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    offset = (page - 1) * per_page
    total = db.query(func.count(GuestVisit.id)).scalar()
    visits = (
        db.query(GuestVisit)
        .order_by(GuestVisit.created_at.desc())
        .offset(offset)
        .limit(per_page)
        .all()
    )

    items = []
    for v in visits:
        plan_price = v.plan_price or Decimal("0.00")
        amount_paid = v.amount_paid or Decimal("0.00")
        overpayment = max(Decimal("0.00"), amount_paid - plan_price) if plan_price > 0 else Decimal("0.00")
        change_given = v.change_given or Decimal("0.00")

        items.append({
            "id": str(v.id),
            "name": v.name,
            "phone": v.phone,
            "payment_method": v.payment_method.value if v.payment_method else None,
            "amount_paid": str(amount_paid),
            "plan_id": str(v.plan_id) if v.plan_id else None,
            "plan_name": v.plan_name,
            "plan_price": str(plan_price),
            "overpayment": str(overpayment),
            "change_given": str(change_given),
            "created_at": v.created_at.isoformat(),
        })

    return {
        "items": items,
        "total": total,
        "page": page,
        "per_page": per_page,
    }


@router.post("/{guest_id}/change")
def give_change(
    guest_id: uuid.UUID,
    data: GiveChangeRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Record change given to a guest and create a refund transaction."""
    visit = db.query(GuestVisit).filter(GuestVisit.id == guest_id).first()
    if not visit:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Guest visit not found")

    # Calculate max change that can be given
    plan_price = visit.plan_price or Decimal("0.00")
    amount_paid = visit.amount_paid or Decimal("0.00")
    overpayment = max(Decimal("0.00"), amount_paid - plan_price)
    already_given = visit.change_given or Decimal("0.00")
    remaining_overpayment = overpayment - already_given

    if data.amount <= 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Change amount must be greater than zero"
        )

    if data.amount > remaining_overpayment:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot give more change than remaining overpayment (${remaining_overpayment:.2f})"
        )

    # Update the guest visit record
    visit.change_given = already_given + data.amount

    # Create a refund transaction to track the change given
    refund_tx = Transaction(
        member_id=None,  # Guest visit
        transaction_type=TransactionType.refund,
        payment_method=PaymentMethod.cash,
        amount=data.amount,
        guest_name=visit.name,
        notes=f"Change given for overpayment on {visit.plan_name}",
        created_by=current_user.id,
    )
    db.add(refund_tx)
    db.commit()
    db.refresh(visit)
    db.refresh(refund_tx)

    logger.info(
        "Change given to guest: visit=%s, guest=%s, amount=$%s, by=%s",
        guest_id, visit.name, data.amount, current_user.id
    )

    return {
        "message": f"${data.amount:.2f} change recorded",
        "transaction_id": str(refund_tx.id),
        "change_given": str(visit.change_given),
        "remaining_overpayment": str(remaining_overpayment - data.amount),
    }
