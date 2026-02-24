import logging
import uuid
from datetime import date, timedelta
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
from app.services.auth_service import get_current_user
from app.services.auto_charge_service import charge_saved_card_now, enable_auto_charge
from app.services.membership_service import (
    adjust_swims,
    create_membership,
    update_membership,
)
from app.services.payment_service import get_payment_adapter

router = APIRouter()


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
    message = None

    # If no payment info, just create the membership
    if not data.payment:
        membership = create_membership(db, data.member_id, data.plan_id)
        message = "Membership created without payment"
    else:
        payment = data.payment

        if payment.payment_method == "cash":
            # Cash payment
            membership = create_membership(db, data.member_id, data.plan_id)
            amount = payment.amount_tendered if payment.amount_tendered else plan.price

            tx = Transaction(
                member_id=data.member_id,
                transaction_type=TransactionType.payment,
                payment_method=PaymentMethod.cash,
                amount=amount,
                plan_id=data.plan_id,
                membership_id=membership.id,
                created_by=current_user.id,
                notes=f"Cash payment via admin (${amount})",
            )
            db.add(tx)
            db.commit()
            db.refresh(tx)
            transaction_id = tx.id
            message = f"Membership created with cash payment of ${amount}"
            logger.info("Admin cash payment: member=%s, plan=%s, amount=$%s, by=%s",
                       data.member_id, plan.name, amount, current_user.id)

        elif payment.payment_method == "card":
            if payment.saved_card_id:
                # Use existing saved card
                tx = charge_saved_card_now(db, payment.saved_card_id, data.plan_id, data.member_id)
                transaction_id = tx.id
                saved_card_id = payment.saved_card_id
                # Get the membership that was created by charge_saved_card_now
                membership = db.query(Membership).filter_by(id=tx.membership_id).first()
                message = f"Membership created and charged ${plan.price} to saved card"
                logger.info("Admin saved card payment: member=%s, plan=%s, card=%s, by=%s",
                           data.member_id, plan.name, payment.saved_card_id, current_user.id)

            elif payment.card_last4 and payment.card_brand:
                # New card details provided
                membership = create_membership(db, data.member_id, data.plan_id)

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
                        new_card.next_charge_date = date.today() + timedelta(days=plan.duration_days or 30)
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
                    amount=plan.price,
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
