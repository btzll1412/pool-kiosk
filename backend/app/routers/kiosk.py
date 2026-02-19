import logging
import uuid
from datetime import date
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

from app.database import get_db
from app.models.card import Card
from app.models.guest_visit import GuestVisit
from app.models.member import Member
from app.models.membership import Membership
from app.models.membership_freeze import MembershipFreeze
from app.models.plan import Plan, PlanType
from app.models.saved_card import SavedCard
from app.models.transaction import PaymentMethod, Transaction, TransactionType
from app.schemas.kiosk import (
    AutoChargeDisableRequest,
    AutoChargeRequest,
    CardPaymentRequest,
    CashPaymentRequest,
    CreditPaymentRequest,
    GuestVisitRequest,
    GuestVisitResponse,
    KioskCheckinRequest,
    KioskCheckinResponse,
    KioskFreezeRequest,
    KioskSignupRequest,
    KioskUnfreezeRequest,
    MemberStatus,
    ActiveMembershipInfo,
    PaymentResponse,
    PinVerifyRequest,
    SavedCardDetailResponse,
    SavedCardRequest,
    SavedCardResponse,
    SavedCardUpdateRequest,
    ScanRequest,
    SearchRequest,
    SetDefaultCardRequest,
    SplitPaymentRequest,
    TokenizeCardRequest,
)
from app.services.auto_charge_service import (
    charge_saved_card_now,
    disable_auto_charge,
    enable_auto_charge,
)
from app.services.checkin_service import perform_checkin
from app.services.membership_service import create_membership, freeze_membership, unfreeze_membership
from app.services.notification_service import notify_checkin, send_change_notification
from app.services.payment_service import get_payment_adapter, process_card_payment, process_cash_payment
from app.services.auth_service import hash_pin
from app.services.pin_service import verify_member_pin
from app.services.rate_limit import limiter
from app.services.settings_service import get_setting

router = APIRouter()


@router.post("/scan", response_model=MemberStatus)
@limiter.limit("30/minute")
def scan_card(data: ScanRequest, request: Request, db: Session = Depends(get_db)):
    card = db.query(Card).filter(Card.rfid_uid == data.rfid_uid, Card.is_active.is_(True)).first()
    if not card:
        logger.info("Card scan — unrecognized: rfid=%s", data.rfid_uid)
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Card not recognized")
    member = db.query(Member).filter(Member.id == card.member_id, Member.is_active.is_(True)).first()
    if not member:
        logger.warning("Card scan — member inactive: rfid=%s, member=%s", data.rfid_uid, card.member_id)
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Member not found or inactive")
    logger.info("Card scanned: rfid=%s, member=%s %s", data.rfid_uid, member.first_name, member.last_name)
    return _build_member_status(db, member)


@router.get("/members", response_model=list[MemberStatus])
@limiter.limit("30/minute")
def list_all_members(request: Request, db: Session = Depends(get_db)):
    members = (
        db.query(Member)
        .filter(Member.is_active.is_(True))
        .order_by(Member.first_name, Member.last_name)
        .all()
    )
    return [_build_member_status(db, m) for m in members]


@router.post("/search", response_model=list[MemberStatus])
@limiter.limit("15/minute")
def search_members(data: SearchRequest, request: Request, db: Session = Depends(get_db)):
    from sqlalchemy import or_
    pattern = f"%{data.query}%"
    members = (
        db.query(Member)
        .filter(
            Member.is_active.is_(True),
            or_(
                Member.first_name.ilike(pattern),
                Member.last_name.ilike(pattern),
                Member.phone.ilike(pattern),
            ),
        )
        .limit(10)
        .all()
    )
    return [_build_member_status(db, m) for m in members]


@router.post("/verify-pin")
@limiter.limit("15/minute")
def verify_pin_endpoint(data: PinVerifyRequest, request: Request, db: Session = Depends(get_db)):
    verify_member_pin(db, data.member_id, data.pin)
    return {"valid": True}


@router.post("/signup", response_model=MemberStatus)
@limiter.limit("10/minute")
def kiosk_signup(data: KioskSignupRequest, request: Request, db: Session = Depends(get_db)):
    # Check if phone already exists
    existing = db.query(Member).filter(Member.phone == data.phone, Member.is_active.is_(True)).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this phone number already exists",
        )

    # Validate PIN
    if len(data.pin) != 4 or not data.pin.isdigit():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="PIN must be exactly 4 digits",
        )

    # Create member
    member = Member(
        first_name=data.first_name,
        last_name=data.last_name,
        phone=data.phone,
        email=data.email,
        pin_hash=hash_pin(data.pin),
    )
    db.add(member)
    db.commit()
    db.refresh(member)
    logger.info("Kiosk signup: member=%s, name=%s %s", member.id, member.first_name, member.last_name)
    return _build_member_status(db, member)


@router.post("/checkin", response_model=KioskCheckinResponse)
@limiter.limit("60/minute")
def kiosk_checkin(data: KioskCheckinRequest, request: Request, db: Session = Depends(get_db)):
    max_guests = int(get_setting(db, "family_max_guests", "5"))
    if data.guest_count > max_guests:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Maximum {max_guests} guests allowed",
        )
    checkin = perform_checkin(db, data.member_id, data.guest_count)

    member = db.query(Member).filter(Member.id == data.member_id).first()
    if member:
        notify_checkin(
            db,
            member_name=f"{member.first_name} {member.last_name}",
            member_id=str(member.id),
            checkin_type=checkin.checkin_type.value,
            guest_count=checkin.guest_count,
        )

    guests_msg = f" + {checkin.guest_count} guest(s)" if checkin.guest_count > 0 else ""
    logger.info("Kiosk check-in: member=%s, guests=%d", data.member_id, checkin.guest_count)
    return KioskCheckinResponse(
        checkin_id=checkin.id,
        checkin_type=checkin.checkin_type,
        guest_count=checkin.guest_count,
        message=f"Checked in successfully{guests_msg}!",
    )


@router.get("/plans")
@limiter.limit("30/minute")
def get_kiosk_plans(request: Request, db: Session = Depends(get_db)):
    plans = db.query(Plan).filter(Plan.is_active.is_(True)).order_by(Plan.display_order, Plan.name).all()
    return [
        {
            "id": str(p.id),
            "name": p.name,
            "plan_type": p.plan_type.value,
            "price": str(p.price),
            "swim_count": p.swim_count,
            "duration_days": p.duration_days,
        }
        for p in plans
    ]


@router.get("/settings")
@limiter.limit("60/minute")
def get_kiosk_settings(request: Request, db: Session = Depends(get_db)):
    """Public endpoint for kiosk display settings."""
    pool_name = get_setting(db, "pool_name", "Pool")
    currency = get_setting(db, "currency_symbol", "$")
    return {
        "poolName": pool_name,
        "pool_name": pool_name,
        "currency": currency,
        "timezone": get_setting(db, "timezone", "America/New_York"),
        "checkin_return_seconds": get_setting(db, "checkin_return_seconds", "8"),
        "inactivity_timeout_seconds": get_setting(db, "inactivity_timeout_seconds", "30"),
        "inactivity_warning_seconds": get_setting(db, "inactivity_warning_seconds", "10"),
        "family_max_guests": get_setting(db, "family_max_guests", "5"),
        "cash_box_instructions": get_setting(db, "cash_box_instructions", ""),
        "guest_visit_enabled": get_setting(db, "guest_visit_enabled", "true"),
        "split_payment_enabled": get_setting(db, "split_payment_enabled", "true"),
        # Kiosk display settings
        "kiosk_welcome_title": get_setting(db, "kiosk_welcome_title", "Welcome to {pool_name}"),
        "kiosk_welcome_subtitle": get_setting(db, "kiosk_welcome_subtitle", "Scan your membership card to get started"),
        "kiosk_card_instruction": get_setting(db, "kiosk_card_instruction", "Hold your card near the reader"),
        "kiosk_help_text": get_setting(db, "kiosk_help_text", "Need help? Please ask a staff member."),
        "kiosk_overlay_enabled": get_setting(db, "kiosk_overlay_enabled", "false"),
        "kiosk_overlay_text": get_setting(db, "kiosk_overlay_text", ""),
        "kiosk_locked": get_setting(db, "kiosk_locked", "false"),
        "kiosk_lock_message": get_setting(db, "kiosk_lock_message", "Kiosk is currently unavailable. Please see staff."),
        "kiosk_bg_type": get_setting(db, "kiosk_bg_type", "gradient"),
        "kiosk_bg_color": get_setting(db, "kiosk_bg_color", "#0284c7"),
        "kiosk_bg_image": get_setting(db, "kiosk_bg_image", ""),
        "kiosk_bg_image_mode": get_setting(db, "kiosk_bg_image_mode", "cover"),
    }


@router.post("/pay/cash", response_model=PaymentResponse)
@limiter.limit("20/minute")
def pay_cash(data: CashPaymentRequest, request: Request, db: Session = Depends(get_db)):
    verify_member_pin(db, data.member_id, data.pin)
    plan = db.query(Plan).filter(Plan.id == data.plan_id).first()
    if not plan:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Plan not found")

    member = db.query(Member).filter(Member.id == data.member_id).first()
    if not member:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Member not found")

    credit_used = Decimal("0.00")
    effective_price = plan.price

    # Apply account credit if requested
    if data.use_credit and member.credit_balance > 0:
        credit_used = min(member.credit_balance, plan.price)
        effective_price = plan.price - credit_used
        member.credit_balance -= credit_used

    # If credit covers entire amount, no cash needed
    if effective_price <= 0:
        membership = create_membership(db, data.member_id, data.plan_id)
        credit_tx = Transaction(
            member_id=data.member_id,
            transaction_type=TransactionType.payment,
            payment_method=PaymentMethod.credit,
            amount=credit_used,
            plan_id=data.plan_id,
            membership_id=membership.id,
            notes="Paid with account credit",
        )
        db.add(credit_tx)
        db.commit()
        db.refresh(credit_tx)
        logger.info("Kiosk credit-only payment: member=%s, plan=%s, credit=$%s", data.member_id, data.plan_id, credit_used)
        return PaymentResponse(
            success=True,
            transaction_id=credit_tx.id,
            membership_id=membership.id,
            credit_used=credit_used,
            message=f"Paid ${credit_used} with account credit.",
        )

    # Validate cash amount covers remaining price
    if data.amount_tendered < effective_price:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Minimum ${effective_price} required (after ${credit_used} credit applied)",
        )

    # Create membership
    membership = create_membership(db, data.member_id, data.plan_id)

    # Record credit transaction if credit was used
    if credit_used > 0:
        credit_tx = Transaction(
            member_id=data.member_id,
            transaction_type=TransactionType.payment,
            payment_method=PaymentMethod.credit,
            amount=credit_used,
            plan_id=data.plan_id,
            membership_id=membership.id,
            notes="Credit portion of payment",
        )
        db.add(credit_tx)

    # Handle cash payment for remaining amount
    change_due = Decimal("0.00")
    credit_added = Decimal("0.00")
    overpayment = data.amount_tendered - effective_price

    if overpayment > 0:
        if data.wants_change:
            change_due = overpayment
        else:
            member.credit_balance += overpayment
            credit_added = overpayment

    cash_tx = Transaction(
        member_id=data.member_id,
        transaction_type=TransactionType.payment,
        payment_method=PaymentMethod.cash,
        amount=data.amount_tendered,
        plan_id=data.plan_id,
        membership_id=membership.id,
        notes="Cash portion of payment" if credit_used > 0 else None,
    )
    db.add(cash_tx)
    db.commit()
    db.refresh(cash_tx)

    if credit_used > 0:
        msg = f"Payment recorded: ${credit_used} credit + ${data.amount_tendered} cash."
    elif change_due > 0:
        msg = f"Payment recorded. ${change_due} change due."
    elif credit_added > 0:
        msg = f"Payment recorded. ${credit_added} added to your account credit."
    else:
        msg = "Payment recorded successfully."

    logger.info("Kiosk cash payment: member=%s, plan=%s, cash=$%s, credit=$%s", data.member_id, data.plan_id, data.amount_tendered, credit_used)
    return PaymentResponse(
        success=True,
        transaction_id=cash_tx.id,
        membership_id=membership.id,
        change_due=change_due,
        credit_added=credit_added,
        credit_used=credit_used,
        message=msg,
    )


@router.post("/pay/card", response_model=PaymentResponse)
@limiter.limit("20/minute")
def pay_card(data: CardPaymentRequest, request: Request, db: Session = Depends(get_db)):
    verify_member_pin(db, data.member_id, data.pin)

    plan = db.query(Plan).filter(Plan.id == data.plan_id).first()
    if not plan:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Plan not found")

    member = db.query(Member).filter(Member.id == data.member_id).first()
    if not member:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Member not found")

    credit_used = Decimal("0.00")
    effective_price = plan.price

    # Apply account credit if requested
    if data.use_credit and member.credit_balance > 0:
        credit_used = min(member.credit_balance, plan.price)
        effective_price = plan.price - credit_used
        member.credit_balance -= credit_used

    # If credit covers entire amount, no card charge needed
    if effective_price <= 0:
        membership = create_membership(db, data.member_id, data.plan_id)
        credit_tx = Transaction(
            member_id=data.member_id,
            transaction_type=TransactionType.payment,
            payment_method=PaymentMethod.credit,
            amount=credit_used,
            plan_id=data.plan_id,
            membership_id=membership.id,
            notes="Paid with account credit",
        )
        db.add(credit_tx)
        db.commit()
        db.refresh(credit_tx)
        logger.info("Kiosk credit-only payment: member=%s, plan=%s, credit=$%s", data.member_id, data.plan_id, credit_used)
        return PaymentResponse(
            success=True,
            transaction_id=credit_tx.id,
            membership_id=membership.id,
            credit_used=credit_used,
            message=f"Paid ${credit_used} with account credit.",
        )

    # Process card payment for remaining amount
    if data.saved_card_id:
        # Use saved card - note: charge_saved_card_now handles membership creation
        tx = charge_saved_card_now(db, data.saved_card_id, data.plan_id, data.member_id)

        # If credit was used, record credit transaction
        if credit_used > 0:
            credit_tx = Transaction(
                member_id=data.member_id,
                transaction_type=TransactionType.payment,
                payment_method=PaymentMethod.credit,
                amount=credit_used,
                plan_id=data.plan_id,
                membership_id=tx.membership_id,
                notes="Credit portion of payment",
            )
            db.add(credit_tx)
            db.commit()

        logger.info("Kiosk card payment: member=%s, plan=%s, card=$%s, credit=$%s", data.member_id, data.plan_id, effective_price, credit_used)
        return PaymentResponse(
            success=True,
            transaction_id=tx.id,
            membership_id=tx.membership_id,
            credit_used=credit_used,
            message=f"Payment processed: ${credit_used} credit + ${effective_price} card." if credit_used > 0 else "Saved card payment processed successfully.",
        )

    # New card payment
    tx = process_card_payment(db, data.member_id, data.plan_id)

    # If credit was used, record credit transaction
    if credit_used > 0:
        credit_tx = Transaction(
            member_id=data.member_id,
            transaction_type=TransactionType.payment,
            payment_method=PaymentMethod.credit,
            amount=credit_used,
            plan_id=data.plan_id,
            membership_id=tx.membership_id,
            notes="Credit portion of payment",
        )
        db.add(credit_tx)

    if data.save_card and data.card_last4:
        adapter = get_payment_adapter(db)
        token = adapter.tokenize_card(data.card_last4, data.card_brand or "", str(data.member_id))
        friendly = data.friendly_name or f"{data.card_brand or 'Card'} ending {data.card_last4}"
        card = SavedCard(
            member_id=data.member_id,
            processor_token=token,
            card_last4=data.card_last4,
            card_brand=data.card_brand,
            friendly_name=friendly,
        )
        db.add(card)

    db.commit()

    logger.info("Kiosk card payment: member=%s, plan=%s, card=$%s, credit=$%s", data.member_id, data.plan_id, effective_price, credit_used)
    return PaymentResponse(
        success=True,
        transaction_id=tx.id,
        membership_id=tx.membership_id,
        credit_used=credit_used,
        message=f"Payment processed: ${credit_used} credit + ${effective_price} card." if credit_used > 0 else "Card payment processed successfully.",
    )


@router.post("/pay/split", response_model=PaymentResponse)
@limiter.limit("10/minute")
def pay_split(data: SplitPaymentRequest, request: Request, db: Session = Depends(get_db)):
    split_enabled = get_setting(db, "split_payment_enabled", "true")
    if split_enabled != "true":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Split payments are disabled")

    verify_member_pin(db, data.member_id, data.pin)

    plan = db.query(Plan).filter(Plan.id == data.plan_id).first()
    if not plan:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Plan not found")

    member = db.query(Member).filter(Member.id == data.member_id).first()
    if not member:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Member not found")

    if data.cash_amount >= plan.price:
        tx, change_due, credit_added = process_cash_payment(db, data.member_id, data.plan_id, data.cash_amount)
        return PaymentResponse(
            success=True,
            transaction_id=tx.id,
            membership_id=tx.membership_id,
            credit_added=credit_added,
            message="Full amount covered by cash.",
        )

    if data.cash_amount <= 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cash amount must be greater than zero for split payment",
        )

    card_amount = plan.price - data.cash_amount

    # Charge the card portion
    adapter = get_payment_adapter(db)
    if data.saved_card_id:
        saved_card = db.query(SavedCard).filter(
            SavedCard.id == data.saved_card_id, SavedCard.member_id == data.member_id
        ).first()
        if not saved_card:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Saved card not found")
        charge_result = adapter.charge_saved_card(
            token=saved_card.processor_token,
            amount=card_amount,
            member_id=str(data.member_id),
            description=f"Split payment (card portion): {plan.name}",
        )
        if not charge_result.success:
            raise HTTPException(
                status_code=status.HTTP_402_PAYMENT_REQUIRED,
                detail=charge_result.message or "Card charge failed",
            )
        card_reference = charge_result.reference_id
    else:
        session = adapter.initiate_payment(card_amount, str(data.member_id), f"Split payment (card portion): {plan.name}")
        card_reference = session.session_id

    # Create the membership once
    membership = create_membership(db, data.member_id, data.plan_id)

    # Record cash transaction
    cash_tx = Transaction(
        member_id=data.member_id,
        transaction_type=TransactionType.payment,
        payment_method=PaymentMethod.cash,
        amount=data.cash_amount,
        plan_id=data.plan_id,
        membership_id=membership.id,
        notes="Split payment (cash portion)",
    )
    db.add(cash_tx)

    # Record card transaction
    card_tx = Transaction(
        member_id=data.member_id,
        transaction_type=TransactionType.payment,
        payment_method=PaymentMethod.card,
        amount=card_amount,
        plan_id=data.plan_id,
        membership_id=membership.id,
        reference_id=card_reference,
        notes="Split payment (card portion)",
    )
    db.add(card_tx)

    db.commit()
    db.refresh(cash_tx)

    logger.info("Kiosk split payment: member=%s, plan=%s, cash=$%s, card=$%s", data.member_id, data.plan_id, data.cash_amount, card_amount)
    return PaymentResponse(
        success=True,
        transaction_id=cash_tx.id,
        membership_id=membership.id,
        message=f"Split payment: ${data.cash_amount} cash + ${card_amount} card.",
    )


@router.post("/pay/credit", response_model=PaymentResponse)
@limiter.limit("20/minute")
def pay_credit(data: CreditPaymentRequest, request: Request, db: Session = Depends(get_db)):
    """Pay for a plan using account credit balance."""
    verify_member_pin(db, data.member_id, data.pin)

    plan = db.query(Plan).filter(Plan.id == data.plan_id).first()
    if not plan:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Plan not found")

    member = db.query(Member).filter(Member.id == data.member_id).first()
    if not member:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Member not found")

    if member.credit_balance <= 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No credit balance available")

    credit_to_use = min(member.credit_balance, plan.price)
    remaining = plan.price - credit_to_use

    if remaining > 0:
        # Partial credit - return the remaining amount needed
        return PaymentResponse(
            success=False,
            credit_used=credit_to_use,
            remaining_due=remaining,
            message=f"Credit of ${credit_to_use} will be applied. ${remaining} remaining to pay.",
        )

    # Full credit payment - deduct credit and create membership
    member.credit_balance -= credit_to_use
    membership = create_membership(db, data.member_id, data.plan_id)

    # Record credit transaction
    credit_tx = Transaction(
        member_id=data.member_id,
        transaction_type=TransactionType.payment,
        payment_method=PaymentMethod.credit,
        amount=credit_to_use,
        plan_id=data.plan_id,
        membership_id=membership.id,
        notes="Paid with account credit",
    )
    db.add(credit_tx)
    db.commit()
    db.refresh(credit_tx)

    logger.info("Kiosk credit payment: member=%s, plan=%s, credit=$%s", data.member_id, data.plan_id, credit_to_use)
    return PaymentResponse(
        success=True,
        transaction_id=credit_tx.id,
        membership_id=membership.id,
        credit_used=credit_to_use,
        message=f"Paid ${credit_to_use} with account credit. Enjoy your swim!",
    )


@router.post("/notify/change")
@limiter.limit("10/minute")
def notify_change(request: Request, member_id: uuid.UUID = None, amount: str = "0", db: Session = Depends(get_db)):
    member = db.query(Member).filter(Member.id == member_id).first() if member_id else None
    name = f"{member.first_name} {member.last_name}" if member else "Guest"
    sent = send_change_notification(db, name, amount)
    return {"notification_sent": sent}


@router.post("/freeze")
@limiter.limit("10/minute")
def kiosk_freeze(data: KioskFreezeRequest, request: Request, db: Session = Depends(get_db)):
    verify_member_pin(db, data.member_id, data.pin)
    membership = (
        db.query(Membership)
        .filter(Membership.member_id == data.member_id, Membership.is_active.is_(True))
        .first()
    )
    if not membership:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No active membership found")
    freeze = freeze_membership(db, membership.id, freeze_days=data.freeze_days, freeze_end=data.freeze_end)
    end_str = str(freeze.freeze_end) if freeze.freeze_end else "until further notice"
    return {"message": f"Membership frozen until {end_str}", "freeze_end": str(freeze.freeze_end)}


@router.post("/unfreeze")
@limiter.limit("10/minute")
def kiosk_unfreeze(data: KioskUnfreezeRequest, request: Request, db: Session = Depends(get_db)):
    verify_member_pin(db, data.member_id, data.pin)
    membership = (
        db.query(Membership)
        .filter(Membership.member_id == data.member_id, Membership.is_active.is_(True))
        .first()
    )
    if not membership:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No active membership found")
    unfreeze_membership(db, membership.id)
    return {"message": "Membership unfrozen. Welcome back!"}


@router.get("/saved-cards", response_model=list[SavedCardDetailResponse])
@limiter.limit("15/minute")
def list_saved_cards(
    request: Request,
    member_id: uuid.UUID = None,
    pin: str = None,
    db: Session = Depends(get_db),
):
    if not member_id or not pin:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="member_id and pin required")
    verify_member_pin(db, member_id, pin)
    cards = db.query(SavedCard).filter(SavedCard.member_id == member_id).all()
    result = []
    for c in cards:
        plan_name = None
        if c.auto_charge_plan_id:
            plan = db.query(Plan).filter(Plan.id == c.auto_charge_plan_id).first()
            plan_name = plan.name if plan else None
        result.append(SavedCardDetailResponse(
            id=c.id,
            card_last4=c.card_last4,
            card_brand=c.card_brand,
            friendly_name=c.friendly_name,
            is_default=c.is_default,
            auto_charge_enabled=c.auto_charge_enabled,
            auto_charge_plan_name=plan_name,
            next_charge_date=c.next_charge_date,
        ))
    return result


@router.post("/saved-cards", response_model=SavedCardResponse, status_code=201)
@limiter.limit("10/minute")
def save_card(data: SavedCardRequest, request: Request, member_id: uuid.UUID = None, db: Session = Depends(get_db)):
    if not member_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="member_id required")
    friendly = data.friendly_name or f"{data.card_brand or 'Card'} ending {data.card_last4}"
    card = SavedCard(
        member_id=member_id,
        processor_token=data.processor_token,
        card_last4=data.card_last4,
        card_brand=data.card_brand,
        friendly_name=friendly,
    )
    db.add(card)
    db.commit()
    db.refresh(card)
    return card


@router.post("/saved-cards/tokenize", response_model=SavedCardResponse, status_code=201)
@limiter.limit("10/minute")
def tokenize_and_save_card(data: TokenizeCardRequest, request: Request, db: Session = Depends(get_db)):
    verify_member_pin(db, data.member_id, data.pin)
    adapter = get_payment_adapter(db)
    token = adapter.tokenize_card(data.card_last4, data.card_brand or "", str(data.member_id))
    friendly = data.friendly_name or f"{data.card_brand or 'Card'} ending {data.card_last4}"
    card = SavedCard(
        member_id=data.member_id,
        processor_token=token,
        card_last4=data.card_last4,
        card_brand=data.card_brand,
        friendly_name=friendly,
    )
    db.add(card)
    db.commit()
    db.refresh(card)
    return card


@router.put("/saved-cards/{card_id}", response_model=SavedCardResponse)
@limiter.limit("10/minute")
def update_saved_card(card_id: uuid.UUID, data: SavedCardUpdateRequest, request: Request, db: Session = Depends(get_db)):
    card = db.query(SavedCard).filter(SavedCard.id == card_id).first()
    if not card:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Card not found")
    card.friendly_name = data.friendly_name
    db.commit()
    db.refresh(card)
    return card


@router.delete("/saved-cards/{card_id}")
@limiter.limit("10/minute")
def delete_saved_card(
    card_id: uuid.UUID,
    request: Request,
    member_id: uuid.UUID = None,
    pin: str = None,
    db: Session = Depends(get_db),
):
    if not member_id or not pin:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="member_id and pin required")
    verify_member_pin(db, member_id, pin)
    card = db.query(SavedCard).filter(SavedCard.id == card_id, SavedCard.member_id == member_id).first()
    if not card:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Card not found")
    db.delete(card)
    db.commit()
    return {"message": "Card removed"}


@router.put("/saved-cards/{card_id}/default")
@limiter.limit("10/minute")
def set_default_card(
    card_id: uuid.UUID,
    data: SetDefaultCardRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    verify_member_pin(db, data.member_id, data.pin)
    card = db.query(SavedCard).filter(SavedCard.id == card_id, SavedCard.member_id == data.member_id).first()
    if not card:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Card not found")
    # Clear default on all other cards
    db.query(SavedCard).filter(
        SavedCard.member_id == data.member_id, SavedCard.id != card_id
    ).update({"is_default": False})
    card.is_default = True
    db.commit()
    return {"message": "Default card updated"}


@router.post("/saved-cards/{card_id}/auto-charge")
@limiter.limit("10/minute")
def enable_auto_charge_endpoint(
    card_id: uuid.UUID,
    data: AutoChargeRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    verify_member_pin(db, data.member_id, data.pin)
    card = enable_auto_charge(db, card_id, data.plan_id, data.member_id)
    return {"message": "Auto-charge enabled", "next_charge_date": str(card.next_charge_date)}


@router.delete("/saved-cards/{card_id}/auto-charge")
@limiter.limit("10/minute")
def disable_auto_charge_endpoint(
    card_id: uuid.UUID,
    data: AutoChargeDisableRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    verify_member_pin(db, data.member_id, data.pin)
    disable_auto_charge(db, card_id, data.member_id)
    return {"message": "Auto-charge disabled"}


@router.post("/guest", response_model=GuestVisitResponse)
@limiter.limit("15/minute")
def guest_visit(data: GuestVisitRequest, request: Request, db: Session = Depends(get_db)):
    guest_enabled = get_setting(db, "guest_visit_enabled", "true")
    if guest_enabled != "true":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Guest visits are disabled")

    plan = db.query(Plan).filter(Plan.id == data.plan_id, Plan.is_active.is_(True)).first()
    if not plan:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Plan not found")

    visit = GuestVisit(
        name=data.name,
        phone=data.phone,
        payment_method=data.payment_method,
        amount_paid=plan.price,
    )
    db.add(visit)

    # Create a transaction record for revenue tracking
    payment_method_enum = PaymentMethod.cash if data.payment_method == "cash" else PaymentMethod.card
    transaction = Transaction(
        member_id=None,  # Guest visit, no member
        transaction_type=TransactionType.payment,
        payment_method=payment_method_enum,
        amount=plan.price,
        notes=f"Guest visit: {data.name} - {plan.name}",
    )
    db.add(transaction)

    db.commit()
    db.refresh(visit)
    logger.info("Guest visit: name=%s, plan=%s, amount=$%s", data.name, plan.name, plan.price)
    return GuestVisitResponse(visit_id=visit.id, amount_paid=plan.price, message=f"Welcome, {data.name}! Enjoy your swim.")


def _build_member_status(db: Session, member: Member) -> MemberStatus:
    today = date.today()
    active_info = None
    is_frozen = False
    frozen_until = None

    memberships = (
        db.query(Membership)
        .filter(Membership.member_id == member.id, Membership.is_active.is_(True))
        .all()
    )

    for m in memberships:
        freeze = (
            db.query(MembershipFreeze)
            .filter(
                MembershipFreeze.membership_id == m.id,
                MembershipFreeze.freeze_end.isnot(None),
                MembershipFreeze.freeze_end >= today,
                MembershipFreeze.freeze_start <= today,
            )
            .first()
        )
        open_freeze = (
            db.query(MembershipFreeze)
            .filter(MembershipFreeze.membership_id == m.id, MembershipFreeze.freeze_end.is_(None))
            .first()
        )

        if freeze or open_freeze:
            is_frozen = True
            frozen_until = freeze.freeze_end if freeze else None
            continue

        if m.plan_type == PlanType.monthly and m.valid_from and m.valid_until:
            if m.valid_from <= today <= m.valid_until:
                active_info = ActiveMembershipInfo(
                    membership_id=m.id,
                    plan_name=m.plan.name if m.plan else "Monthly",
                    plan_type=m.plan_type,
                    valid_until=m.valid_until,
                )
                break
        elif m.plan_type in (PlanType.swim_pass, PlanType.single):
            remaining = (m.swims_total or 0) - m.swims_used
            if remaining > 0:
                active_info = ActiveMembershipInfo(
                    membership_id=m.id,
                    plan_name=m.plan.name if m.plan else ("Swim Pass" if m.plan_type == PlanType.swim_pass else "Single Swim"),
                    plan_type=m.plan_type,
                    swims_remaining=remaining,
                )
                break

    return MemberStatus(
        member_id=member.id,
        first_name=member.first_name,
        last_name=member.last_name,
        phone=member.phone,
        credit_balance=member.credit_balance,
        has_pin=member.pin_hash is not None,
        active_membership=active_info,
        is_frozen=is_frozen,
        frozen_until=frozen_until,
    )
