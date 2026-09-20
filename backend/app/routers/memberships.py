import logging
import uuid
from datetime import date
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

from app.database import get_db
from app.models.member import Member
from app.models.membership import Membership
from app.models.plan import Plan, PlanType
from app.models.saved_card import SavedCard
from app.models.transaction import PaymentMethod, Transaction, TransactionType
from app.models.user import User
from app.schemas.membership import (
    MembershipCreate,
    MembershipCreateWithPaymentResponse,
    MembershipResponse,
    MembershipUpdate,
    SwimAdjustRequest,
)
from app.services.activity_service import log_activity
from app.services.auth_service import get_current_user
from app.services.billing_service import BillingMode, quote_membership, quote_to_dict
from app.services.pricing_service import get_member_price
from app.services.auto_charge_service import charge_saved_card_now, enable_auto_charge, _get_first_of_next_month, _get_next_billing_date
from app.services.membership_service import (
    adjust_swims,
    create_membership,
    update_membership,
)
from app.services.payment_service import get_payment_adapter

router = APIRouter()


def _get_local_today(db: Session) -> date:
    from app.services.membership_service import _get_local_today as local_today
    return local_today(db)


def _schedule_charge_on_start_date(db, data: MembershipCreate, plan: Plan, start: date, today: date, quote, current_user: User):
    """Don't charge now: the saved card is charged on the start date and the membership starts then.

    If that charge fails the membership does not start; the daily auto-charge job
    retries and fires the auto_charge_failed notification.
    """
    if plan.plan_type != PlanType.monthly or quote is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                            detail="Charging on the start date is only available for monthly-type plans")
    if start <= today:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                            detail="Charging on the start date requires a start date in the future")
    card_id = data.payment.saved_card_id if data.payment else None
    card = db.query(SavedCard).filter(SavedCard.id == card_id, SavedCard.member_id == data.member_id).first() if card_id else None
    if not card:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                            detail="Charging on the start date requires a saved card on file")

    db.query(SavedCard).filter(
        SavedCard.member_id == data.member_id,
        SavedCard.auto_charge_enabled.is_(True),
        SavedCard.id != card.id,
    ).update({"auto_charge_enabled": False, "auto_charge_plan_id": None, "next_charge_date": None})

    autopay = bool(data.payment.enable_autopay)
    card.auto_charge_enabled = True
    card.auto_charge_plan_id = plan.id
    card.billing_day = quote.billing_day
    card.next_charge_date = start
    card.charge_once = not autopay
    db.commit()

    log_activity(
        db, user_id=current_user.id, action="membership.schedule_charge", entity_type="member",
        entity_id=data.member_id,
        after={"plan": plan.name, "charge_date": str(start), "amount": str(quote.amount), "auto_renew": autopay},
    )
    logger.info("Scheduled charge on start date: member=%s, plan=%s, date=%s, amount=$%s, by=%s",
                data.member_id, plan.name, start, quote.amount, current_user.id)
    return MembershipCreateWithPaymentResponse(
        plan_name=plan.name,
        saved_card_id=card.id,
        scheduled_charge_date=start,
        message=f"${quote.amount} will be charged to card *{card.card_last4} on {start.strftime('%m/%d/%Y')}. "
                f"The membership starts once the charge succeeds.",
    )


@router.get("/quote")
def quote_membership_endpoint(
    member_id: uuid.UUID,
    plan_id: uuid.UUID,
    start_date: date | None = None,
    billing_mode: BillingMode = BillingMode.prorate,
    billing_day: int | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    """Price and dates for a membership — what the admin form shows before charging."""
    plan = db.query(Plan).filter(Plan.id == plan_id).first()
    if not plan:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Plan not found")
    price = get_member_price(db, member_id, plan_id)
    if plan.plan_type != PlanType.monthly:
        return {"amount": str(price), "quote": None}
    quote = quote_membership(price, plan.duration_months, start_date or _get_local_today(db), billing_mode, billing_day)
    return {"amount": str(quote.amount), "quote": quote_to_dict(quote)}


@router.post("", response_model=MembershipCreateWithPaymentResponse, status_code=201)
def create_membership_endpoint(
    data: MembershipCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a membership with optional payment processing."""
    # Validate member exists
    member = db.query(Member).filter(Member.id == data.member_id).first()
    if not member:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Member not found")

    # Validate plan exists
    plan = db.query(Plan).filter(Plan.id == data.plan_id).first()
    if not plan:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Plan not found")

    transaction_id = None
    saved_card_id = None
    credit_added = None
    message = None

    # Price and dates come from the billing service
    today = _get_local_today(db)
    start = data.start_date or today
    quote = None
    dates_billing_day = None
    list_price = get_member_price(db, data.member_id, data.plan_id)
    if plan.plan_type == PlanType.monthly:
        mode = data.billing_mode or (BillingMode.prorate if data.billing_day else BillingMode.full)
        quote = quote_membership(list_price, plan.duration_months, start, mode, data.billing_day)
        dates_billing_day = quote.billing_day if mode == BillingMode.prorate else None

    if data.charge_timing == "start_date":
        return _schedule_charge_on_start_date(db, data, plan, start, today, quote, current_user)

    # If no payment info, just create the membership
    if not data.payment:
        membership = create_membership(db, data.member_id, data.plan_id, start_date=data.start_date, billing_day=dates_billing_day)
        db.commit()
        message = "Membership created without payment"
    else:
        payment = data.payment

        # Determine charge amount (prorate/custom override or full price)
        if payment.charge_amount:
            effective_price = Decimal(str(payment.charge_amount))
        else:
            effective_price = quote.amount if quote else list_price

        if payment.payment_method == "cash":
            # Cash payment
            membership = create_membership(db, data.member_id, data.plan_id, start_date=data.start_date, billing_day=dates_billing_day)
            amount_tendered = Decimal(str(payment.amount_tendered)) if payment.amount_tendered else effective_price
            credit_added = Decimal("0.00")

            # Handle overpayment - add to member's credit balance
            if amount_tendered > effective_price:
                credit_added = amount_tendered - effective_price
                member.credit_balance += credit_added

                # Create credit_add transaction for the overpayment
                credit_tx = Transaction(
                    member_id=data.member_id,
                    transaction_type=TransactionType.credit_add,
                    payment_method=PaymentMethod.cash,
                    amount=credit_added,
                    created_by=current_user.id,
                    notes="Overpayment added as credit (via admin)",
                )
                db.add(credit_tx)

            # Create payment transaction
            tx = Transaction(
                member_id=data.member_id,
                transaction_type=TransactionType.payment,
                payment_method=PaymentMethod.cash,
                amount=effective_price,
                plan_id=data.plan_id,
                membership_id=membership.id,
                created_by=current_user.id,
                notes=f"Cash payment via admin (${amount_tendered} tendered, charged ${effective_price})",
            )
            db.add(tx)
            db.commit()
            db.refresh(tx)
            transaction_id = tx.id

            if credit_added > 0:
                message = f"Membership created with cash payment of ${effective_price}. ${credit_added} added to account credit."
            else:
                message = f"Membership created with cash payment of ${effective_price}"
            logger.info("Admin cash payment: member=%s, plan=%s, tendered=$%s, charged=$%s, credit_added=$%s, by=%s",
                       data.member_id, plan.name, amount_tendered, effective_price, credit_added, current_user.id)

        elif payment.payment_method == "card":
            if payment.saved_card_id:
                # Use existing saved card with optional custom amount
                tx = charge_saved_card_now(db, payment.saved_card_id, data.plan_id, data.member_id, amount_override=effective_price, start_date=data.start_date, billing_day=dates_billing_day)
                transaction_id = tx.id
                saved_card_id = payment.saved_card_id
                # Get the membership that was created by charge_saved_card_now
                membership = db.query(Membership).filter_by(id=tx.membership_id).first()
                message = f"Membership created and charged ${effective_price} to saved card"
                logger.info("Admin saved card payment: member=%s, plan=%s, amount=$%s, card=%s, by=%s",
                           data.member_id, plan.name, effective_price, payment.saved_card_id, current_user.id)

            elif payment.card_last4 and payment.card_brand:
                # New card details provided
                membership = create_membership(db, data.member_id, data.plan_id, start_date=data.start_date, billing_day=dates_billing_day)

                if payment.save_card:
                    # Tokenize and save the card
                    adapter = get_payment_adapter(db)
                    token = adapter.tokenize_card(
                        payment.card_last4, payment.card_brand, str(data.member_id)
                    )

                    new_card = SavedCard(
                        member_id=data.member_id,
                        processor_token=token,
                        card_last4=payment.card_last4,
                        card_brand=payment.card_brand,
                        is_default=False,
                    )
                    db.add(new_card)
                    db.flush()
                    saved_card_id = new_card.id

                    # Enable autopay if requested and plan is monthly
                    if payment.enable_autopay and plan.plan_type == PlanType.monthly:
                        new_card.auto_charge_enabled = True
                        new_card.auto_charge_plan_id = plan.id
                        # Renew exactly when the paid period ends
                        new_card.billing_day = membership.next_billing_date.day
                        new_card.next_charge_date = membership.next_billing_date
                        message = f"Membership created, card saved, and autopay enabled"
                    else:
                        message = f"Membership created and card saved"
                else:
                    message = f"Membership created with card payment (card not saved)"

                # Create transaction record for the card payment
                tx = Transaction(
                    member_id=data.member_id,
                    transaction_type=TransactionType.payment,
                    payment_method=PaymentMethod.card,
                    amount=effective_price,
                    plan_id=data.plan_id,
                    membership_id=membership.id,
                    created_by=current_user.id,
                    notes=f"Card payment via admin ({payment.card_brand} *{payment.card_last4})",
                )
                db.add(tx)
                db.commit()
                db.refresh(tx)
                transaction_id = tx.id
                logger.info("Admin new card payment: member=%s, plan=%s, save=%s, autopay=%s, by=%s",
                           data.member_id, plan.name, payment.save_card, payment.enable_autopay, current_user.id)

            else:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Card payment requires either saved_card_id or card_last4 + card_brand"
                )
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid payment method. Use 'cash' or 'card'"
            )

    return MembershipCreateWithPaymentResponse(
        id=membership.id,
        member_id=membership.member_id,
        plan_id=membership.plan_id,
        plan_type=membership.plan_type,
        swims_total=membership.swims_total,
        swims_used=membership.swims_used,
        valid_from=membership.valid_from,
        valid_until=membership.valid_until,
        is_active=membership.is_active,
        created_at=membership.created_at,
        plan_name=plan.name,
        transaction_id=transaction_id,
        saved_card_id=saved_card_id,
        credit_added=credit_added,
        message=message,
    )


@router.put("/{membership_id}", response_model=MembershipResponse)
def update_membership_endpoint(
    membership_id: uuid.UUID,
    data: MembershipUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    membership = update_membership(db, membership_id, data.model_dump(exclude_unset=True), user_id=current_user.id)
    return _to_response(membership)


@router.post("/{membership_id}/adjust", response_model=MembershipResponse)
def adjust_swims_endpoint(
    membership_id: uuid.UUID,
    data: SwimAdjustRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    membership = adjust_swims(db, membership_id, data.adjustment, data.notes, user_id=current_user.id)
    return _to_response(membership)


def _to_response(membership) -> MembershipResponse:
    return MembershipResponse(
        id=membership.id,
        member_id=membership.member_id,
        plan_id=membership.plan_id,
        plan_type=membership.plan_type,
        swims_total=membership.swims_total,
        swims_used=membership.swims_used,
        valid_from=membership.valid_from,
        valid_until=membership.valid_until,
        is_active=membership.is_active,
        created_at=membership.created_at,
        plan_name=membership.plan.name if membership.plan else None,
    )
