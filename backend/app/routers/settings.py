from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User
from app.schemas.settings import SettingsUpdateRequest
from app.services.activity_service import log_activity
from app.services.auth_service import get_current_user
from app.services.settings_service import get_all_settings, update_settings

router = APIRouter()


@router.get("")
def get_settings(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return get_all_settings(db)


@router.put("")
def update_settings_endpoint(
    data: SettingsUpdateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    before = get_all_settings(db)
    result = update_settings(db, data.settings)
    log_activity(
        db, user_id=current_user.id, action="settings.update",
        entity_type="settings", before=before, after=result,
    )
    return result
