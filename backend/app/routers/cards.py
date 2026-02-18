import logging
import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

from app.database import get_db
from app.models.user import User
from app.schemas.card import CardCreate, CardResponse
from app.services.auth_service import get_current_user
from app.services.member_service import assign_card, deactivate_card, get_member_cards

router = APIRouter()


@router.get("/{member_id}/cards", response_model=list[CardResponse])
def list_cards(
    member_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return get_member_cards(db, member_id)


@router.post("/{member_id}/cards", response_model=CardResponse, status_code=201)
def assign_card_endpoint(
    member_id: uuid.UUID,
    data: CardCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return assign_card(db, member_id, data.rfid_uid, user_id=current_user.id)


@router.delete("/{member_id}/cards/{card_id}", response_model=CardResponse)
def deactivate_card_endpoint(
    member_id: uuid.UUID,
    card_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return deactivate_card(db, member_id, card_id, user_id=current_user.id)
