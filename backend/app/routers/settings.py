import logging

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

from app.database import get_db
from app.models.user import User
from app.schemas.settings import SettingsUpdateRequest
from app.services.activity_service import log_activity
from app.services.auth_service import get_current_user
from app.services.notification_service import WebhookEvent, fire_test_webhook
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
    logger.info("Settings updated by user=%s, keys=%s", current_user.username, list(data.settings.keys()))
    return result


@router.post("/webhook-test")
def test_webhook(
    event_type: str = Query(..., description="Webhook event type to test"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        event = WebhookEvent(event_type)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid event type: {event_type}. Valid types: {[e.value for e in WebhookEvent]}",
        )
    success = fire_test_webhook(db, event)
    if success:
        logger.info("Webhook test sent: event=%s, by_user=%s", event_type, current_user.username)
        return {"success": True, "message": f"Test webhook sent for '{event_type}'"}
    logger.info("Webhook test skipped — no URL configured: event=%s", event_type)
    return {"success": False, "message": f"No webhook URL configured for '{event_type}'"}
