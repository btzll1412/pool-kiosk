import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.guest_visit import GuestVisit
from app.models.user import User
from app.services.auth_service import get_current_user

router = APIRouter()


@router.get("")
def list_guests(
    page: int = Query(1, ge=1),
    per_page: int = Query(25, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    offset = (page - 1) * per_page
    total = db.query(func.count(GuestVisit.id)).scalar()
    visits = (
        db.query(GuestVisit)
        .order_by(GuestVisit.created_at.desc())
        .offset(offset)
        .limit(per_page)
        .all()
    )
    return {
        "items": [
            {
                "id": str(v.id),
                "name": v.name,
                "phone": v.phone,
                "payment_method": v.payment_method.value,
                "amount_paid": str(v.amount_paid),
                "created_at": v.created_at.isoformat(),
            }
            for v in visits
        ],
        "total": total,
        "page": page,
        "per_page": per_page,
    }
