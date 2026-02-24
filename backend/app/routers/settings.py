import logging
import os
import uuid

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

UPLOAD_DIR = "/app/uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)

from app.database import get_db
from app.models.user import User
from app.schemas.settings import SettingsUpdateRequest
from app.services.activity_service import log_activity
from app.services.auth_service import get_current_user
from app.services.notification_service import WebhookEvent, fire_test_webhook
from app.services.payment_service import get_payment_adapter
from app.services.settings_service import (
    SENSITIVE_KEYS,
    get_all_settings,
    get_processor_config,
    update_settings,
)

router = APIRouter()


@router.get("")
def get_settings(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return get_all_settings(db, mask_sensitive=True)


@router.put("")
def update_settings_endpoint(
    data: SettingsUpdateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Filter out masked values — don't overwrite real secrets with bullet chars
    filtered = {}
    for key, value in data.settings.items():
        if key in SENSITIVE_KEYS and value == "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022":
            continue
        filtered[key] = value

    before = get_all_settings(db)
    result = update_settings(db, filtered)
    log_activity(
        db, user_id=current_user.id, action="settings.update",
        entity_type="settings", before=before, after=result,
    )
    logger.info("Settings updated by user=%s, keys=%s", current_user.username, list(filtered.keys()))
    return get_all_settings(db, mask_sensitive=True)


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


@router.post("/payment-test")
def test_payment_connection(
    processor: str = Query(..., description="Payment processor to test (stripe, square, sola)"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    valid_processors = ("stripe", "square", "sola", "hitech", "stub")
    if processor not in valid_processors:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid processor: {processor}. Valid: {valid_processors}",
        )
    config = get_processor_config(db, processor)
    from app.payments.stripe_adapter import StripePaymentAdapter
    from app.payments.square_adapter import SquarePaymentAdapter
    from app.payments.sola_adapter import SolaPaymentAdapter
    from app.payments.hitech_adapter import HiTechPaymentAdapter
    from app.payments.stub import StubPaymentAdapter

    adapter_map = {
        "stripe": StripePaymentAdapter,
        "square": SquarePaymentAdapter,
        "sola": SolaPaymentAdapter,
        "hitech": HiTechPaymentAdapter,
        "stub": StubPaymentAdapter,
    }
    adapter = adapter_map[processor](config=config)
    success, message = adapter.test_connection()
    logger.info("Payment test: processor=%s, success=%s, by_user=%s", processor, success, current_user.username)
    return {"success": success, "message": message}


@router.post("/email-test")
def test_email_connection(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from app.services.email_service import test_email_connection as _test_email
    success, message = _test_email(db)
    logger.info("Email test: success=%s, by_user=%s", success, current_user.username)
    return {"success": success, "message": message}


@router.post("/sip-test")
def test_sip_connection(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from app.services.sip_service import test_sip_connection as _test_sip
    success, message = _test_sip(db)
    logger.info("SIP test: success=%s, by_user=%s", success, current_user.username)
    return {"success": success, "message": message}


@router.post("/upload-background")
async def upload_kiosk_background(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Validate file type
    allowed_types = {"image/jpeg", "image/png", "image/gif", "image/webp"}
    if file.content_type not in allowed_types:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid file type. Allowed: {', '.join(allowed_types)}",
        )

    # Generate unique filename
    ext = file.filename.split(".")[-1] if "." in file.filename else "jpg"
    filename = f"kiosk_bg_{uuid.uuid4().hex[:8]}.{ext}"
    filepath = os.path.join(UPLOAD_DIR, filename)

    # Save file
    content = await file.read()
    with open(filepath, "wb") as f:
        f.write(content)

    # Update setting with new image path
    image_url = f"/api/uploads/{filename}"
    update_settings(db, {"kiosk_bg_image": image_url})

    logger.info("Kiosk background uploaded: %s by user=%s", filename, current_user.username)
    return {"success": True, "url": image_url}
