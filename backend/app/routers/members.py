import csv
import io
import logging
import uuid

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

from app.database import get_db
from app.models.activity_log import ActivityLog
from app.models.checkin import Checkin
from app.models.member import Member
from app.models.membership import Membership
from app.models.plan import Plan
from app.models.saved_card import SavedCard
from app.models.user import User
from app.schemas.membership import SavedCardCreate, SavedCardResponse
from app.services.auth_service import hash_pin
from app.services.payment_service import get_payment_adapter
from app.schemas.member import (
    CreditAdjustRequest,
    MemberCreate,
    MemberListResponse,
    MemberResponse,
    MemberUpdate,
    PinResetRequest,
)
from app.services.auth_service import get_current_user
from app.services.member_service import (
    adjust_credit,
    create_member,
    deactivate_member,
    reactivate_member,
    get_member,
    list_members,
    update_member,
)
from app.services.pin_service import get_pin_lockout_status, unlock_member_pin

router = APIRouter()


@router.get("", response_model=MemberListResponse)
def list_members_endpoint(
    search: str | None = None,
    is_active: bool | None = None,
    page: int = Query(1, ge=1),
    per_page: int = Query(25, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    items, total = list_members(db, search=search, is_active=is_active, page=page, per_page=per_page)
    return MemberListResponse(items=items, total=total, page=page, per_page=per_page)


@router.post("", response_model=MemberResponse, status_code=201)
def create_member_endpoint(
    data: MemberCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return create_member(db, data)


@router.get("/{member_id}", response_model=MemberResponse)
def get_member_endpoint(
    member_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return get_member(db, member_id)


@router.put("/{member_id}", response_model=MemberResponse)
def update_member_endpoint(
    member_id: uuid.UUID,
    data: MemberUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return update_member(db, member_id, data, user_id=current_user.id)


@router.delete("/{member_id}", response_model=MemberResponse)
def deactivate_member_endpoint(
    member_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return deactivate_member(db, member_id, user_id=current_user.id)


@router.post("/{member_id}/reactivate", response_model=MemberResponse)
def reactivate_member_endpoint(
    member_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Reactivate a previously deactivated member."""
    return reactivate_member(db, member_id, user_id=current_user.id)


@router.delete("/{member_id}/permanent")
def permanently_delete_member(
    member_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Permanently delete a deactivated member and all their data."""
    member = db.query(Member).filter(Member.id == member_id).first()
    if not member:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Member not found")
    
    if member.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, 
            detail="Member must be deactivated before permanent deletion"
        )
    
    # Delete related records
    db.query(Checkin).filter(Checkin.member_id == member_id).delete()
    db.query(Membership).filter(Membership.member_id == member_id).delete()
    db.query(SavedCard).filter(SavedCard.member_id == member_id).delete()
    db.query(ActivityLog).filter(ActivityLog.entity_id == member_id).delete()
    
    # Delete the member
    db.delete(member)
    db.commit()
    
    logger.info("Member permanently deleted: id=%s, by_user=%s", member_id, current_user.id)
    return {"message": "Member permanently deleted"}


@router.get("/{member_id}/history")
def get_member_history(
    member_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Get activity log entries
    activity_entries = (
        db.query(ActivityLog)
        .filter(ActivityLog.entity_id == member_id)
        .order_by(ActivityLog.created_at.desc())
        .limit(100)
        .all()
    )

    # Get check-in records
    checkin_entries = (
        db.query(Checkin)
        .filter(Checkin.member_id == member_id)
        .order_by(Checkin.checked_in_at.desc())
        .limit(100)
        .all()
    )

    # Merge and format results
    results = []

    for e in activity_entries:
        results.append({
            "id": str(e.id),
            "action_type": e.action_type,
            "entity_type": e.entity_type,
            "before_value": e.before_value,
            "after_value": e.after_value,
            "note": e.note,
            "created_at": e.created_at.isoformat(),
        })

    for c in checkin_entries:
        results.append({
            "id": str(c.id),
            "action_type": "checkin",
            "entity_type": "checkin",
            "before_value": None,
            "after_value": {
                "checkin_type": c.checkin_type.value,
                "guest_count": c.guest_count,
            },
            "note": c.notes or f"Checked in ({c.checkin_type.value.replace('_', ' ')})" + (f" with {c.guest_count} guest(s)" if c.guest_count > 0 else ""),
            "created_at": c.checked_in_at.isoformat(),
        })

    # Sort by created_at descending
    results.sort(key=lambda x: x["created_at"], reverse=True)

    return results[:100]


@router.post("/{member_id}/credit", response_model=MemberResponse)
def adjust_credit_endpoint(
    member_id: uuid.UUID,
    data: CreditAdjustRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return adjust_credit(db, member_id, data, user_id=current_user.id)


@router.get("/{member_id}/memberships")
def get_member_memberships(
    member_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    memberships = (
        db.query(Membership)
        .filter(Membership.member_id == member_id)
        .order_by(Membership.created_at.desc())
        .all()
    )
    result = []
    for m in memberships:
        plan_name = m.plan.name if m.plan else None
        swims_remaining = None
        if m.swims_total is not None:
            swims_remaining = (m.swims_total or 0) - (m.swims_used or 0)
        result.append({
            "id": str(m.id),
            "plan_id": str(m.plan_id) if m.plan_id else None,
            "plan_name": plan_name,
            "plan_type": m.plan_type.value,
            "swims_total": m.swims_total,
            "swims_used": m.swims_used,
            "swims_remaining": swims_remaining,
            "valid_from": str(m.valid_from) if m.valid_from else None,
            "valid_until": str(m.valid_until) if m.valid_until else None,
            "is_active": m.is_active,
            "created_at": m.created_at.isoformat(),
        })
    return result


@router.get("/{member_id}/saved-cards")
def get_member_saved_cards(
    member_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    cards = db.query(SavedCard).filter(SavedCard.member_id == member_id).all()
    result = []
    for c in cards:
        plan_name = None
        if c.auto_charge_plan_id:
            plan = db.query(Plan).filter(Plan.id == c.auto_charge_plan_id).first()
            plan_name = plan.name if plan else None
        result.append({
            "id": str(c.id),
            "card_last4": c.card_last4,
            "card_brand": c.card_brand,
            "friendly_name": c.friendly_name,
            "is_default": c.is_default,
            "auto_charge_enabled": c.auto_charge_enabled,
            "auto_charge_plan_name": plan_name,
            "next_charge_date": str(c.next_charge_date) if c.next_charge_date else None,
            "created_at": c.created_at.isoformat(),
        })
    return result


@router.post("/{member_id}/saved-cards", response_model=SavedCardResponse, status_code=201)
def add_member_saved_card(
    member_id: uuid.UUID,
    data: SavedCardCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Add a saved payment card for a member (admin action, no PIN required)."""
    # Validate member exists
    member = db.query(Member).filter(Member.id == member_id).first()
    if not member:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Member not found")

    # Tokenize the card via payment adapter
    adapter = get_payment_adapter(db)
    token = adapter.tokenize_card(data.card_last4, data.card_brand, str(member_id))

    # Create the saved card record
    saved_card = SavedCard(
        member_id=member_id,
        processor_token=token,
        card_last4=data.card_last4,
        card_brand=data.card_brand,
        friendly_name=data.friendly_name,
        is_default=False,
    )
    db.add(saved_card)
    db.commit()
    db.refresh(saved_card)

    logger.info("Admin added saved card: member=%s, card=%s, by=%s",
               member_id, saved_card.id, current_user.id)

    return SavedCardResponse(
        id=saved_card.id,
        card_last4=saved_card.card_last4,
        card_brand=saved_card.card_brand,
        friendly_name=saved_card.friendly_name,
        is_default=saved_card.is_default,
        created_at=saved_card.created_at,
    )


@router.delete("/{member_id}/saved-cards/{card_id}")
def delete_member_saved_card(
    member_id: uuid.UUID,
    card_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    card = db.query(SavedCard).filter(SavedCard.id == card_id, SavedCard.member_id == member_id).first()
    if not card:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Saved card not found")
    db.delete(card)
    db.commit()
    return {"message": "Saved card removed"}


@router.post("/{member_id}/saved-cards/tokenize-swipe", response_model=SavedCardResponse, status_code=201)
def admin_tokenize_card_from_swipe(
    member_id: uuid.UUID,
    track_data: str,
    friendly_name: str | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Admin endpoint to tokenize a card from magnetic stripe track data.
    No PIN required (admin action).
    """
    member = db.query(Member).filter(Member.id == member_id).first()
    if not member:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Member not found")

    adapter = get_payment_adapter(db)

    if not hasattr(adapter, 'tokenize_from_track_data'):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current payment processor does not support card reader tokenization"
        )

    try:
        token, last4, card_brand = adapter.tokenize_from_track_data(track_data, str(member_id))
    except ValueError as e:
        logger.warning("Failed to parse track data: member=%s, error=%s", member_id, e)
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except RuntimeError as e:
        logger.error("Failed to tokenize card: member=%s, error=%s", member_id, e)
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(e))

    friendly = friendly_name or f"{card_brand or 'Card'} ending {last4}"
    saved_card = SavedCard(
        member_id=member_id,
        processor_token=token,
        card_last4=last4,
        card_brand=card_brand,
        friendly_name=friendly,
    )
    db.add(saved_card)
    db.commit()
    db.refresh(saved_card)

    logger.info("Admin tokenized card from swipe: member=%s, last4=%s, by=%s", member_id, last4, current_user.id)

    return SavedCardResponse(
        id=saved_card.id,
        card_last4=saved_card.card_last4,
        card_brand=saved_card.card_brand,
        friendly_name=saved_card.friendly_name,
        is_default=saved_card.is_default,
        created_at=saved_card.created_at,
    )


@router.post("/{member_id}/saved-cards/tokenize-full", response_model=SavedCardResponse, status_code=201)
def admin_tokenize_card_from_full(
    member_id: uuid.UUID,
    card_number: str,
    exp_date: str,
    friendly_name: str | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Admin endpoint to tokenize a card from full card details.
    Used with hosted payment page callback. No PIN required.
    """
    member = db.query(Member).filter(Member.id == member_id).first()
    if not member:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Member not found")

    adapter = get_payment_adapter(db)

    if not hasattr(adapter, 'generate_card_token'):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current payment processor does not support card tokenization"
        )

    try:
        token, last4, card_brand = adapter.generate_card_token(card_number, exp_date, str(member_id))
    except RuntimeError as e:
        logger.error("Failed to tokenize card: member=%s, error=%s", member_id, e)
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(e))

    friendly = friendly_name or f"{card_brand or 'Card'} ending {last4}"
    saved_card = SavedCard(
        member_id=member_id,
        processor_token=token,
        card_last4=last4,
        card_brand=card_brand,
        friendly_name=friendly,
    )
    db.add(saved_card)
    db.commit()
    db.refresh(saved_card)

    logger.info("Admin tokenized card from full details: member=%s, last4=%s, by=%s", member_id, last4, current_user.id)

    return SavedCardResponse(
        id=saved_card.id,
        card_last4=saved_card.card_last4,
        card_brand=saved_card.card_brand,
        friendly_name=saved_card.friendly_name,
        is_default=saved_card.is_default,
        created_at=saved_card.created_at,
    )


@router.post("/{member_id}/charge-card")
def admin_charge_card(
    member_id: uuid.UUID,
    card_number: str,
    exp_date: str,
    cvv: str,
    amount: str,
    description: str | None = None,
    save_card: bool = False,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Admin endpoint to charge a card directly with manual entry.

    Process a card-not-present payment for a member. This is useful when
    the terminal is unavailable or for phone/remote payments.
    """
    from decimal import Decimal
    from app.models.transaction import Transaction, TransactionType, PaymentMethod

    member = db.query(Member).filter(Member.id == member_id).first()
    if not member:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Member not found")

    # Validate card number format
    clean_card = card_number.replace(" ", "").replace("-", "")
    if not clean_card.isdigit() or len(clean_card) < 13 or len(clean_card) > 19:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid card number format"
        )

    # Validate expiration format (MMYY)
    if not exp_date.isdigit() or len(exp_date) != 4:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Expiration must be in MMYY format"
        )

    # Validate CVV format
    if not cvv.isdigit() or len(cvv) < 3 or len(cvv) > 4:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="CVV must be 3-4 digits"
        )

    # Validate amount
    try:
        charge_amount = Decimal(amount)
        if charge_amount <= 0:
            raise ValueError()
    except (ValueError, TypeError):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid amount"
        )

    adapter = get_payment_adapter(db)

    # Check if adapter supports manual card entry
    if not hasattr(adapter, 'process_manual_card_sale'):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Manual card entry not supported by current payment processor"
        )

    charge_result = adapter.process_manual_card_sale(
        card_number=clean_card,
        exp_date=exp_date,
        cvv=cvv,
        amount=charge_amount,
        member_id=str(member_id),
        description=description or f"Admin charge for {member.first_name} {member.last_name}",
        save_card=save_card,
    )

    if not charge_result.success:
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail=charge_result.message or "Card payment declined"
        )

    # Record transaction
    card_last4 = clean_card[-4:]
    tx = Transaction(
        member_id=member_id,
        transaction_type=TransactionType.payment,
        payment_method=PaymentMethod.card,
        amount=charge_amount,
        reference_id=charge_result.reference_id,
        notes=f"Admin card charge - ****{card_last4}" + (f" - {description}" if description else ""),
    )
    db.add(tx)

    # Save the card if requested and we got a token back
    saved_card_id = None
    if save_card and charge_result.card_token:
        card_brand = _detect_card_brand(clean_card)
        friendly = f"{card_brand} ending {card_last4}"
        saved_card = SavedCard(
            member_id=member_id,
            processor_token=charge_result.card_token,
            card_last4=card_last4,
            card_brand=card_brand,
            friendly_name=friendly,
        )
        db.add(saved_card)
        db.flush()
        saved_card_id = saved_card.id

    db.commit()
    db.refresh(tx)

    logger.info(
        "Admin card charge: member=%s, amount=$%s, by=%s, ref=%s",
        member_id, charge_amount, current_user.id, charge_result.reference_id
    )

    result = {
        "success": True,
        "transaction_id": str(tx.id),
        "reference_id": charge_result.reference_id,
        "amount": str(charge_amount),
        "message": "Card charged successfully",
    }
    if saved_card_id:
        result["saved_card_id"] = str(saved_card_id)
        result["message"] += ". Card saved for future use."

    return result


def _detect_card_brand(card_number: str) -> str:
    """Detect card brand from card number prefix."""
    if card_number.startswith("4"):
        return "Visa"
    elif card_number.startswith(("51", "52", "53", "54", "55")) or (
        len(card_number) >= 4 and 2221 <= int(card_number[:4]) <= 2720
    ):
        return "Mastercard"
    elif card_number.startswith(("34", "37")):
        return "Amex"
    elif card_number.startswith(("6011", "65")) or (
        len(card_number) >= 6 and 644 <= int(card_number[:3]) <= 649
    ):
        return "Discover"
    else:
        return "Card"


@router.get("/{member_id}/pin-status")
def get_member_pin_status(
    member_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get the PIN lockout status for a member."""
    lockout = get_pin_lockout_status(db, member_id)
    if not lockout:
        return {"is_locked": False, "failed_attempts": 0}
    return lockout


@router.post("/{member_id}/unlock-pin")
def unlock_member_pin_endpoint(
    member_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Unlock a member's PIN after lockout (admin only)."""
    unlock_member_pin(db, member_id)
    return {"message": "PIN unlocked successfully"}


@router.post("/{member_id}/reset-pin")
def reset_member_pin_endpoint(
    member_id: uuid.UUID,
    data: PinResetRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Reset a member's PIN (admin only)."""
    # Validate PIN format
    if len(data.new_pin) < 4 or len(data.new_pin) > 6 or not data.new_pin.isdigit():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="PIN must be 4-6 digits"
        )

    member = db.query(Member).filter(Member.id == member_id).first()
    if not member:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Member not found")

    # Log the PIN change
    from app.models.activity_log import ActivityLog
    activity = ActivityLog(
        action_type="member.pin_reset",
        entity_type="member",
        entity_id=member_id,
        user_id=current_user.id,
        note=f"PIN reset by admin",
    )
    db.add(activity)

    # Update PIN
    member.pin_hash = hash_pin(data.new_pin)

    # Also unlock the PIN if it was locked
    unlock_member_pin(db, member_id)

    db.commit()
    logger.info("PIN reset for member=%s by user=%s", member_id, current_user.id)
    return {"message": "PIN reset successfully"}


@router.get("/export/csv")
def export_members_csv(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Export all members as CSV."""
    members = db.query(Member).order_by(Member.last_name, Member.first_name).all()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["First Name", "Last Name", "Phone", "Email", "Credit Balance", "Notes", "Is Active", "Created At"])

    for m in members:
        writer.writerow([
            m.first_name,
            m.last_name,
            m.phone or "",
            m.email or "",
            str(m.credit_balance),
            m.notes or "",
            "Yes" if m.is_active else "No",
            m.created_at.isoformat() if m.created_at else "",
        ])

    logger.info("Members CSV export: %d members by user=%s", len(members), current_user.id)
    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=members.csv"},
    )


@router.post("/import/csv")
async def import_members_csv(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Import members from CSV. Expects columns: First Name, Last Name, Phone, Email, PIN (optional)."""
    if not file.filename.endswith(".csv"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="File must be a CSV")

    content = await file.read()
    try:
        text = content.decode("utf-8")
    except UnicodeDecodeError:
        text = content.decode("latin-1")

    reader = csv.DictReader(io.StringIO(text))
    imported = 0
    skipped = 0
    errors = []

    for i, row in enumerate(reader, start=2):  # Start at 2 to account for header row
        first_name = row.get("First Name", "").strip()
        last_name = row.get("Last Name", "").strip()
        phone = row.get("Phone", "").strip() or None
        email = row.get("Email", "").strip() or None
        pin = row.get("PIN", "").strip() or None

        if not first_name or not last_name:
            errors.append(f"Row {i}: Missing first name or last name")
            skipped += 1
            continue

        # Check for duplicate by phone or email
        if phone:
            existing = db.query(Member).filter(Member.phone == phone).first()
            if existing:
                errors.append(f"Row {i}: Phone {phone} already exists")
                skipped += 1
                continue

        if email:
            existing = db.query(Member).filter(Member.email == email).first()
            if existing:
                errors.append(f"Row {i}: Email {email} already exists")
                skipped += 1
                continue

        member = Member(
            first_name=first_name,
            last_name=last_name,
            phone=phone,
            email=email,
            pin_hash=hash_pin(pin) if pin else None,
        )
        db.add(member)
        imported += 1

    db.commit()
    logger.info("Members CSV import: %d imported, %d skipped by user=%s", imported, skipped, current_user.id)

    return {
        "message": f"Import complete: {imported} members imported, {skipped} skipped",
        "imported": imported,
        "skipped": skipped,
        "errors": errors[:10],  # Only return first 10 errors
    }
