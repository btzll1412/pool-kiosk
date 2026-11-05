import logging
import uuid
from datetime import date, datetime

import pytz
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
from app.services.member_service import member_display_names
from app.services.perf_log import StepTimer
from app.services.auth_service import get_current_user
from app.services.settings_service import get_setting

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
    # Use configured timezone for date interpretation
    tz_name = get_setting(db, "timezone", "America/New_York")
    try:
        local_tz = pytz.timezone(tz_name)
    except pytz.UnknownTimeZoneError:
        local_tz = pytz.timezone("America/New_York")

    query = db.query(Transaction)
    if member_id:
        query = query.filter(Transaction.member_id == member_id)
    if transaction_type:
        query = query.filter(Transaction.transaction_type == transaction_type)
    if payment_method:
        query = query.filter(Transaction.payment_method == payment_method)
    if start_date:
        # Convert local date to UTC for database query
        start_local = local_tz.localize(datetime.combine(start_date, datetime.min.time()))
        start_utc = start_local.astimezone(pytz.UTC).replace(tzinfo=None)
        query = query.filter(Transaction.created_at >= start_utc)
    if end_date:
        # Convert local date to UTC for database query
        end_local = local_tz.localize(datetime.combine(end_date, datetime.max.time()))
        end_utc = end_local.astimezone(pytz.UTC).replace(tzinfo=None)
        query = query.filter(Transaction.created_at <= end_utc)

    perf = StepTimer("transactions.list", page=page, per_page=per_page, member_id=member_id,
                     transaction_type=transaction_type, payment_method=payment_method, start_date=start_date, end_date=end_date)
    total = query.count()
    perf.step("count", total=total)
    transactions = query.order_by(Transaction.created_at.desc()).offset((page - 1) * per_page).limit(per_page).all()
    perf.step("page_query", rows=len(transactions))

    # Build response with member, plan, and card names (plan/saved_card are selectin-loaded
    # in bulk; member names come from one query instead of one lazy load per row)
    member_names = member_display_names(db, (tx.member_id for tx in transactions))
    perf.step("member_names", members=len(member_names))
    items = []
    for tx in transactions:
        item = TransactionResponse(
            id=tx.id,
            member_id=tx.member_id,
            member_name=member_names.get(tx.member_id) if tx.member_id else None,
            guest_name=tx.guest_name,
            transaction_type=tx.transaction_type,
            payment_method=tx.payment_method,
            amount=tx.amount,
            plan_id=tx.plan_id,
            plan_name=tx.plan.name if tx.plan else None,
            membership_id=tx.membership_id,
            saved_card_id=tx.saved_card_id,
            card_last4=tx.saved_card.card_last4 if tx.saved_card else None,
            card_brand=tx.saved_card.card_brand if tx.saved_card else None,
            card_name=tx.saved_card.friendly_name if tx.saved_card else None,
            reference_id=tx.reference_id,
            notes=tx.notes,
            created_by=tx.created_by,
            created_at=tx.created_at,
        )
        items.append(item)
    perf.step("rows_built", returned=len(items))
    perf.__exit__(None, None, None)

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
