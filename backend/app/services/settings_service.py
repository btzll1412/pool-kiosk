import json

from sqlalchemy.orm import Session

from app.models.setting import Setting

DEFAULT_SETTINGS = {
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
}


def get_all_settings(db: Session) -> dict[str, str]:
    settings = db.query(Setting).all()
    result = dict(DEFAULT_SETTINGS)
    for s in settings:
        result[s.key] = s.value
    return result


def get_setting(db: Session, key: str, default: str | None = None) -> str:
    setting = db.query(Setting).filter(Setting.key == key).first()
    if setting:
        return setting.value
    return DEFAULT_SETTINGS.get(key, default or "")


def get_setting_from_db(db: Session, key: str, default: str = "") -> str:
    return get_setting(db, key, default)


def update_settings(db: Session, updates: dict[str, str]) -> dict[str, str]:
    for key, value in updates.items():
        setting = db.query(Setting).filter(Setting.key == key).first()
        if setting:
            setting.value = value
        else:
            setting = Setting(key=key, value=value)
            db.add(setting)
    db.commit()
    return get_all_settings(db)
