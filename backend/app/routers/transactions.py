import logging
import uuid
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

from app.database import get_db
from app.models.transaction import PaymentMethod, Transaction, TransactionType
from app.models.user import User
from app.schemas.transaction import (
    ManualTransactionCreate,
    TransactionListResponse,
    TransactionNotesUpdate,
    TransactionResponse,
)
from app.services.activity_service import log_activity
from app.services.auth_service import get_current_user

router = APIRouter()


@router.get("", response_model=TransactionListResponse)
def list_transactions(
    member_id: uuid.UUID | None = None,
    transaction_type: TransactionType | None = None,
    payment_method: PaymentMethod | None = None,
    start_date: date | None = None,
    end_date: date | None = None,
    page: int = Query(1, ge=1),
    per_page: int = Query(25, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = db.query(Transaction)
    if member_id:
        query = query.filter(Transaction.member_id == member_id)
    if transaction_type:
        query = query.filter(Transaction.transaction_type == transaction_type)
    if payment_method:
        query = query.filter(Transaction.payment_method == payment_method)
    if start_date:
        from datetime import datetime
        query = query.filter(Transaction.created_at >= datetime.combine(start_date, datetime.min.time()))
    if end_date:
        from datetime import datetime
        query = query.filter(Transaction.created_at <= datetime.combine(end_date, datetime.max.time()))

    total = query.count()
    items = query.order_by(Transaction.created_at.desc()).offset((page - 1) * per_page).limit(per_page).all()
    return TransactionListResponse(items=items, total=total, page=page, per_page=per_page)


@router.post("/manual", response_model=TransactionResponse, status_code=201)
def create_manual_transaction(
    data: ManualTransactionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    tx = Transaction(
        member_id=data.member_id,
        transaction_type=data.transaction_type,
        payment_method=data.payment_method,
        amount=data.amount,
        plan_id=data.plan_id,
        notes=data.notes,
        created_by=current_user.id,
    )
    db.add(tx)
    db.commit()
    db.refresh(tx)
    log_activity(
        db, user_id=current_user.id, action="transaction.manual_create",
        entity_type="transaction", entity_id=tx.id,
        after={"amount": str(tx.amount), "type": tx.transaction_type.value},
    )
    logger.info("Manual transaction created: tx=%s, type=%s, amount=$%s, by_user=%s", tx.id, tx.transaction_type.value, tx.amount, current_user.username)
    return tx


@router.put("/{transaction_id}/notes", response_model=TransactionResponse)
def update_transaction_notes(
    transaction_id: uuid.UUID,
    data: TransactionNotesUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    tx = db.query(Transaction).filter(Transaction.id == transaction_id).first()
    if not tx:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Transaction not found")
    before_notes = tx.notes
    tx.notes = data.notes
    db.commit()
    db.refresh(tx)
    log_activity(
        db, user_id=current_user.id, action="transaction.notes_update",
        entity_type="transaction", entity_id=tx.id,
        before={"notes": before_notes}, after={"notes": tx.notes},
    )
    return tx
