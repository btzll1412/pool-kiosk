import logging
from datetime import datetime
from enum import Enum

import httpx
from sqlalchemy.orm import Session

from app.services.settings_service import get_setting, update_settings

logger = logging.getLogger(__name__)


class WebhookEvent(str, Enum):
    change_needed = "change_needed"
    checkin = "checkin"
    membership_expiring = "membership_expiring"
    membership_expired = "membership_expired"
    low_balance = "low_balance"
    auto_charge_success = "auto_charge_success"
    auto_charge_failed = "auto_charge_failed"
    daily_summary = "daily_summary"


WEBHOOK_SETTINGS_MAP: dict[WebhookEvent, str] = {
    WebhookEvent.change_needed: "webhook_change_needed",
    WebhookEvent.checkin: "webhook_checkin",
    WebhookEvent.membership_expiring: "webhook_membership_expiring",
    WebhookEvent.membership_expired: "webhook_membership_expired",
    WebhookEvent.low_balance: "webhook_low_balance",
    WebhookEvent.auto_charge_success: "webhook_auto_charge_success",
    WebhookEvent.auto_charge_failed: "webhook_auto_charge_failed",
    WebhookEvent.daily_summary: "webhook_daily_summary",
}


def fire_webhook(db: Session, event: WebhookEvent, data: dict) -> bool:
    """Fire a webhook for the given event. Returns True if sent, False otherwise."""
    settings_key = WEBHOOK_SETTINGS_MAP[event]
    url = get_setting(db, settings_key, "")
    if not url:
        return False

    payload = {
        "event": event.value,
        "timestamp": datetime.now().isoformat(),
        "data": data,
    }

    try:
        httpx.post(url, json=payload, timeout=5.0)
        logger.info("Webhook fired: %s -> %s", event.value, url)
        return True
    except httpx.RequestError as exc:
        logger.warning("Webhook failed for %s: %s", event.value, exc)
        return False


def fire_test_webhook(db: Session, event: WebhookEvent) -> bool:
    """Fire a test webhook with sample data for admin testing."""
    test_data = {
        WebhookEvent.change_needed: {"member_name": "Test Member", "amount": "5.00"},
        WebhookEvent.checkin: {"member_name": "Test Member", "member_id": "00000000-0000-0000-0000-000000000000", "checkin_type": "membership", "guest_count": 0},
        WebhookEvent.membership_expiring: {"member_name": "Test Member", "member_id": "00000000-0000-0000-0000-000000000000", "days_remaining": 3, "plan_name": "Monthly Pass"},
        WebhookEvent.membership_expired: {"member_name": "Test Member", "member_id": "00000000-0000-0000-0000-000000000000", "plan_name": "Monthly Pass"},
        WebhookEvent.low_balance: {"member_name": "Test Member", "member_id": "00000000-0000-0000-0000-000000000000", "balance": "2.50", "threshold": "5.00"},
        WebhookEvent.auto_charge_success: {"member_name": "Test Member", "member_id": "00000000-0000-0000-0000-000000000000", "plan_name": "Monthly Pass", "amount": "25.00", "card_last4": "4242"},
        WebhookEvent.auto_charge_failed: {"member_name": "Test Member", "member_id": "00000000-0000-0000-0000-000000000000", "plan_name": "Monthly Pass", "amount": "25.00", "card_last4": "4242", "reason": "Test failure"},
        WebhookEvent.daily_summary: {"pool_name": "Test Pool", "date": str(datetime.now().date()), "total_checkins_today": 42, "unique_members_today": 30, "revenue_today": "350.00", "active_memberships": 120, "guests_today": 5},
    }
    return fire_webhook(db, event, test_data.get(event, {}))


# --- Convenience functions ---

def notify_checkin(db: Session, member_name: str, member_id: str, checkin_type: str, guest_count: int) -> bool:
    return fire_webhook(db, WebhookEvent.checkin, {
        "member_name": member_name,
        "member_id": member_id,
        "checkin_type": checkin_type,
        "guest_count": guest_count,
    })


def notify_membership_expiring(db: Session, member_name: str, member_id: str, days_remaining: int, plan_name: str) -> bool:
    return fire_webhook(db, WebhookEvent.membership_expiring, {
        "member_name": member_name,
        "member_id": member_id,
        "days_remaining": days_remaining,
        "plan_name": plan_name,
    })


def notify_membership_expired(db: Session, member_name: str, member_id: str, plan_name: str) -> bool:
    return fire_webhook(db, WebhookEvent.membership_expired, {
        "member_name": member_name,
        "member_id": member_id,
        "plan_name": plan_name,
    })


def notify_low_balance(db: Session, member_name: str, member_id: str, balance: str, threshold: str) -> bool:
    return fire_webhook(db, WebhookEvent.low_balance, {
        "member_name": member_name,
        "member_id": member_id,
        "balance": balance,
        "threshold": threshold,
    })


def notify_auto_charge_success(db: Session, member_name: str, member_id: str, plan_name: str, amount: str, card_last4: str) -> bool:
    return fire_webhook(db, WebhookEvent.auto_charge_success, {
        "member_name": member_name,
        "member_id": member_id,
        "plan_name": plan_name,
        "amount": amount,
        "card_last4": card_last4,
    })


def notify_auto_charge_failed(db: Session, member_name: str, member_id: str, plan_name: str, amount: str, card_last4: str, reason: str) -> bool:
    return fire_webhook(db, WebhookEvent.auto_charge_failed, {
        "member_name": member_name,
        "member_id": member_id,
        "plan_name": plan_name,
        "amount": amount,
        "card_last4": card_last4,
        "reason": reason,
    })


def notify_daily_summary(db: Session, data: dict) -> bool:
    return fire_webhook(db, WebhookEvent.daily_summary, data)


# --- Backward-compatible wrapper ---

def send_change_notification(db: Session, member_name: str, amount: str) -> bool:
    """Backward-compatible wrapper. Migrates old setting key on first call."""
    old_url = get_setting(db, "change_notification_webhook", "")
    new_url = get_setting(db, "webhook_change_needed", "")

    if old_url and not new_url:
        update_settings(db, {"webhook_change_needed": old_url})

    return fire_webhook(db, WebhookEvent.change_needed, {
        "member_name": member_name,
        "amount": amount,
    })
