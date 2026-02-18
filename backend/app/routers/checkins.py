import logging

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

from app.database import get_db
from app.models.checkin import Checkin
from app.models.user import User
from app.schemas.checkin import CheckinResponse
from app.services.auth_service import get_current_user

router = APIRouter()


@router.get("", response_model=list[CheckinResponse])
def list_checkins(
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return (
        db.query(Checkin)
        .order_by(Checkin.checked_in_at.desc())
        .offset((page - 1) * per_page)
        .limit(per_page)
        .all()
    )
