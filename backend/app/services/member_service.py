import uuid
from decimal import Decimal

from fastapi import HTTPException, status
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.models.card import Card
from app.models.member import Member
from app.models.transaction import PaymentMethod, Transaction, TransactionType
from app.schemas.member import CreditAdjustRequest, MemberCreate, MemberUpdate
from app.services.activity_service import log_activity
from app.services.auth_service import hash_pin


def list_members(
    db: Session,
    search: str | None = None,
    is_active: bool | None = None,
    page: int = 1,
    per_page: int = 25,
) -> tuple[list[Member], int]:
    query = db.query(Member)
    if search:
        pattern = f"%{search}%"
        query = query.filter(
            or_(
                Member.first_name.ilike(pattern),
                Member.last_name.ilike(pattern),
                Member.phone.ilike(pattern),
                Member.email.ilike(pattern),
            )
        )
    if is_active is not None:
        query = query.filter(Member.is_active == is_active)
    total = query.count()
    items = query.order_by(Member.last_name, Member.first_name).offset((page - 1) * per_page).limit(per_page).all()
    return items, total


def get_member(db: Session, member_id: uuid.UUID) -> Member:
    member = db.query(Member).filter(Member.id == member_id).first()
    if not member:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Member not found")
    return member


def create_member(db: Session, data: MemberCreate) -> Member:
    member = Member(
        first_name=data.first_name,
        last_name=data.last_name,
        phone=data.phone,
        email=data.email,
        photo_url=data.photo_url,
        notes=data.notes,
    )
    if data.pin:
        member.pin_hash = hash_pin(data.pin)
    db.add(member)
    db.commit()
    db.refresh(member)
    return member


def update_member(
    db: Session, member_id: uuid.UUID, data: MemberUpdate, user_id: uuid.UUID | None = None
) -> Member:
    member = get_member(db, member_id)
    before = {
        "first_name": member.first_name,
        "last_name": member.last_name,
        "phone": member.phone,
        "email": member.email,
        "is_active": member.is_active,
    }
    update_data = data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(member, field, value)
    db.commit()
    db.refresh(member)
    after = {
        "first_name": member.first_name,
        "last_name": member.last_name,
        "phone": member.phone,
        "email": member.email,
        "is_active": member.is_active,
    }
    log_activity(db, user_id=user_id, action="member.update", entity_type="member", entity_id=member.id, before=before, after=after)
    return member


def deactivate_member(db: Session, member_id: uuid.UUID, user_id: uuid.UUID | None = None) -> Member:
    member = get_member(db, member_id)
    member.is_active = False
    db.commit()
    db.refresh(member)
    log_activity(db, user_id=user_id, action="member.deactivate", entity_type="member", entity_id=member.id)
    return member


def adjust_credit(
    db: Session, member_id: uuid.UUID, data: CreditAdjustRequest, user_id: uuid.UUID | None = None
) -> Member:
    member = get_member(db, member_id)
    before_balance = member.credit_balance
    member.credit_balance += data.amount
    if member.credit_balance < 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Credit balance cannot go negative")
    tx_type = TransactionType.credit_add if data.amount > 0 else TransactionType.manual_adjustment
    tx = Transaction(
        member_id=member.id,
        transaction_type=tx_type,
        payment_method=PaymentMethod.manual,
        amount=data.amount,
        notes=data.notes,
        created_by=user_id,
    )
    db.add(tx)
    db.commit()
    db.refresh(member)
    log_activity(
        db,
        user_id=user_id,
        action="credit.adjust",
        entity_type="member",
        entity_id=member.id,
        before={"credit_balance": str(before_balance)},
        after={"credit_balance": str(member.credit_balance)},
        note=data.notes,
    )
    return member


def get_member_cards(db: Session, member_id: uuid.UUID) -> list[Card]:
    get_member(db, member_id)
    return db.query(Card).filter(Card.member_id == member_id).all()


def assign_card(db: Session, member_id: uuid.UUID, rfid_uid: str, user_id: uuid.UUID | None = None) -> Card:
    get_member(db, member_id)
    existing = db.query(Card).filter(Card.rfid_uid == rfid_uid, Card.is_active.is_(True)).first()
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Card already assigned to a member")
    card = Card(member_id=member_id, rfid_uid=rfid_uid)
    db.add(card)
    db.commit()
    db.refresh(card)
    log_activity(db, user_id=user_id, action="card.assign", entity_type="card", entity_id=card.id, after={"member_id": str(member_id), "rfid_uid": rfid_uid})
    return card


def deactivate_card(db: Session, member_id: uuid.UUID, card_id: uuid.UUID, user_id: uuid.UUID | None = None) -> Card:
    card = db.query(Card).filter(Card.id == card_id, Card.member_id == member_id).first()
    if not card:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Card not found")
    card.is_active = False
    db.commit()
    db.refresh(card)
    log_activity(db, user_id=user_id, action="card.deactivate", entity_type="card", entity_id=card.id)
    return card
