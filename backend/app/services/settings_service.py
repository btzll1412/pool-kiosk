import json
import logging

from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

from app.models.setting import Setting

DEFAULT_SETTINGS = {
    "timezone": "America/New_York",
    "checkin_count_mode": "each",
    "family_max_guests": "5",
    "checkin_return_seconds": "8",
    "inactivity_timeout_seconds": "30",
    "inactivity_warning_seconds": "10",
    "change_notification_webhook": "",
    "pool_name": "Pool",
    "currency_symbol": "$",
    "cash_box_instructions": "",
    "first_card_fee": "0.00",
    "replacement_card_fee": "0.00",
    "pin_max_attempts": "3",
    "pin_length": "4",
    "auto_charge_enabled": "true",
    "guest_visit_enabled": "true",
    "senior_age_threshold": "65",
    "split_payment_enabled": "true",
    # Webhook URLs (Phase 7)
    "webhook_change_needed": "",
    "webhook_checkin": "",
    "webhook_membership_expiring": "",
    "webhook_membership_expired": "",
    "webhook_low_balance": "",
    "webhook_auto_charge_success": "",
    "webhook_auto_charge_failed": "",
    "webhook_daily_summary": "",
    # Webhook thresholds
    "low_balance_threshold": "5.00",
    "membership_expiry_warning_days": "7",
    # Payment processor (Phase 8)
    "payment_processor": "stub",
    "stripe_api_key": "",
    "stripe_secret_key": "",
    "stripe_webhook_secret": "",
    "square_access_token": "",
    "square_location_id": "",
    "square_environment": "sandbox",
    "sola_api_key": "",
    "sola_api_secret": "",
    "sola_merchant_id": "",
    "sola_environment": "sandbox",
    # HiTech Merchants (Converge) settings
    "hitech_merchant_id": "",
    "hitech_user_id": "",
    "hitech_pin": "",
    "hitech_environment": "sandbox",
    # USAePay
    "usaepay_api_key": "",
    "usaepay_api_pin": "",
    "usaepay_environment": "sandbox",
    # Email / SMTP (Phase 8)
    "email_smtp_host": "",
    "email_smtp_port": "587",
    "email_smtp_username": "",
    "email_smtp_password": "",
    "email_from_address": "",
    "email_from_name": "",
    "email_tls_enabled": "true",
    # SIP / Phone (Phase 8)
    "sip_enabled": "false",
    "sip_server": "",
    "sip_port": "5060",
    "sip_username": "",
    "sip_password": "",
    "sip_caller_id": "",
    "sip_change_needed_number": "",
    "sip_fusionpbx_api_url": "",
    "sip_fusionpbx_api_key": "",
    # Kiosk Display Settings
    "kiosk_welcome_title": "Welcome to {pool_name}",
    "kiosk_welcome_subtitle": "Scan your membership card to get started",
    "kiosk_card_instruction": "Hold your card near the reader",
    "kiosk_help_text": "Need help? Please ask a staff member.",
    "kiosk_overlay_enabled": "false",
    "kiosk_overlay_text": "",
    "kiosk_locked": "false",
    "staff_exit_pin": "0000",
    "kiosk_lock_message": "Kiosk is currently unavailable. Please see staff.",
    "kiosk_bg_type": "gradient",
    "kiosk_bg_color": "#0284c7",
    "kiosk_bg_image": "",
    "kiosk_bg_image_mode": "cover",
}


SENSITIVE_KEYS = {
    "stripe_api_key", "stripe_secret_key", "stripe_webhook_secret",
    "square_access_token",
    "sola_api_key", "sola_api_secret",
    "hitech_pin",
    "usaepay_api_key", "usaepay_api_pin",
    "email_smtp_password",
    "sip_password", "sip_fusionpbx_api_key",
}


def get_all_settings(db: Session, mask_sensitive: bool = False) -> dict[str, str]:
    settings = db.query(Setting).all()
    result = dict(DEFAULT_SETTINGS)
    for s in settings:
        result[s.key] = s.value
    if mask_sensitive:
        for key in SENSITIVE_KEYS:
            if result.get(key):
                result[key] = "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022"
    return result


def get_setting(db: Session, key: str, default: str | None = None) -> str:
    setting = db.query(Setting).filter(Setting.key == key).first()
    if setting:
        return setting.value
    return DEFAULT_SETTINGS.get(key, default or "")


def get_setting_from_db(db: Session, key: str, default: str = "") -> str:
    return get_setting(db, key, default)


def get_processor_config(db: Session, processor: str) -> dict[str, str]:
    """Get processor-specific config dict from DB settings."""
    prefix_map = {
        "stripe": ["stripe_api_key", "stripe_secret_key", "stripe_webhook_secret"],
        "square": ["square_access_token", "square_location_id", "square_environment"],
        "sola": ["sola_api_key", "sola_api_secret", "sola_merchant_id", "sola_environment"],
        "hitech": ["hitech_merchant_id", "hitech_user_id", "hitech_pin", "hitech_environment"],
        "usaepay": ["usaepay_api_key", "usaepay_api_pin", "usaepay_environment"],
    }
    keys = prefix_map.get(processor, [])
    return {k: get_setting(db, k, "") for k in keys}


def update_settings(db: Session, updates: dict[str, str]) -> dict[str, str]:
    for key, value in updates.items():
        setting = db.query(Setting).filter(Setting.key == key).first()
        if setting:
            setting.value = value
        else:
            setting = Setting(key=key, value=value)
            db.add(setting)
    db.commit()
    logger.info("Settings updated: %d keys changed (%s)", len(updates), ", ".join(updates.keys()))
    return get_all_settings(db)
