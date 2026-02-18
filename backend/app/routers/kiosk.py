import uuid
from datetime import date
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.card import Card
from app.models.guest_visit import GuestVisit
from app.models.member import Member
from app.models.membership import Membership
from app.models.membership_freeze import MembershipFreeze
from app.models.plan import Plan, PlanType
from app.models.saved_card import SavedCard
from app.models.transaction import PaymentMethod
from app.schemas.kiosk import (
    CardPaymentRequest,
    CashPaymentRequest,
    GuestVisitRequest,
    GuestVisitResponse,
    KioskCheckinRequest,
    KioskCheckinResponse,
    KioskFreezeRequest,
    KioskUnfreezeRequest,
    MemberStatus,
    ActiveMembershipInfo,
    PaymentResponse,
    SavedCardRequest,
    SavedCardResponse,
    SavedCardUpdateRequest,
    ScanRequest,
    SearchRequest,
    SplitPaymentRequest,
)
from app.services.checkin_service import perform_checkin
from app.services.membership_service import freeze_membership, unfreeze_membership
from app.services.notification_service import send_change_notification
from app.services.payment_service import process_card_payment, process_cash_payment
from app.services.pin_service import verify_member_pin
from app.services.rate_limit import limiter
from app.services.settings_service import get_setting

router = APIRouter()


@router.post("/scan", response_model=MemberStatus)
@limiter.limit("30/minute")
def scan_card(data: ScanRequest, request: Request, db: Session = Depends(get_db)):
    card = db.query(Card).filter(Card.rfid_uid == data.rfid_uid, Card.is_active.is_(True)).first()
    if not card:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Card not recognized")
    member = db.query(Member).filter(Member.id == card.member_id, Member.is_active.is_(True)).first()
    if not member:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Member not found or inactive")
    return _build_member_status(db, member)


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
    guests_msg = f" + {checkin.guest_count} guest(s)" if checkin.guest_count > 0 else ""
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


@router.post("/pay/cash", response_model=PaymentResponse)
@limiter.limit("20/minute")
def pay_cash(data: CashPaymentRequest, request: Request, db: Session = Depends(get_db)):
    verify_member_pin(db, data.member_id, data.pin)
    plan = db.query(Plan).filter(Plan.id == data.plan_id).first()
    if not plan:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Plan not found")

    needs_change = data.amount_tendered > plan.price and (data.amount_tendered - plan.price) > Decimal("0.00")

    tx, change_due, credit_added = process_cash_payment(db, data.member_id, data.plan_id, data.amount_tendered)

    if needs_change and credit_added > 0:
        msg = f"Payment recorded. ${credit_added} added to your account credit."
    else:
        msg = "Payment recorded successfully."

    return PaymentResponse(
        success=True,
        transaction_id=tx.id,
        membership_id=tx.membership_id,
        change_due=change_due,
        credit_added=credit_added,
        message=msg,
    )


@router.post("/pay/card", response_model=PaymentResponse)
@limiter.limit("20/minute")
def pay_card(data: CardPaymentRequest, request: Request, db: Session = Depends(get_db)):
    verify_member_pin(db, data.member_id, data.pin)
    tx = process_card_payment(db, data.member_id, data.plan_id)
    return PaymentResponse(
        success=True,
        transaction_id=tx.id,
        membership_id=tx.membership_id,
        message="Card payment processed successfully.",
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

    if data.cash_amount >= plan.price:
        tx, change_due, credit_added = process_cash_payment(db, data.member_id, data.plan_id, data.cash_amount)
        return PaymentResponse(
            success=True,
            transaction_id=tx.id,
            membership_id=tx.membership_id,
            credit_added=credit_added,
            message="Full amount covered by cash.",
        )

    card_amount = plan.price - data.cash_amount
    tx, _, _ = process_cash_payment(db, data.member_id, data.plan_id, plan.price)
    return PaymentResponse(
        success=True,
        transaction_id=tx.id,
        membership_id=tx.membership_id,
        message=f"Split payment: ${data.cash_amount} cash + ${card_amount} card.",
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


@router.get("/saved-cards", response_model=list[SavedCardResponse])
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
    return cards


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
    db.commit()
    db.refresh(visit)
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
        elif m.plan_type == PlanType.swim_pass:
            remaining = (m.swims_total or 0) - m.swims_used
            if remaining > 0:
                active_info = ActiveMembershipInfo(
                    membership_id=m.id,
                    plan_name=m.plan.name if m.plan else "Swim Pass",
                    plan_type=m.plan_type,
                    swims_remaining=remaining,
                )
                break

    return MemberStatus(
        member_id=member.id,
        first_name=member.first_name,
        last_name=member.last_name,
        credit_balance=member.credit_balance,
        has_pin=member.pin_hash is not None,
        active_membership=active_info,
        is_frozen=is_frozen,
        frozen_until=frozen_until,
    )
