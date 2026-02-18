import httpx

from app.services.settings_service import get_setting_from_db


def send_change_notification(db, member_name: str, amount: str) -> bool:
    webhook_url = get_setting_from_db(db, "change_notification_webhook", "")
    if not webhook_url:
        return False

    try:
        httpx.post(
            webhook_url,
            json={
                "event": "change_needed",
                "member_name": member_name,
                "amount": amount,
            },
            timeout=5.0,
        )
        return True
    except httpx.RequestError:
        return False
