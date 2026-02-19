import logging

import httpx
from sqlalchemy.orm import Session

from app.services.settings_service import get_setting

logger = logging.getLogger(__name__)


def _get_sip_config(db: Session) -> dict[str, str]:
    return {
        "enabled": get_setting(db, "sip_enabled", "false"),
        "server": get_setting(db, "sip_server", ""),
        "port": get_setting(db, "sip_port", "5060"),
        "username": get_setting(db, "sip_username", ""),
        "password": get_setting(db, "sip_password", ""),
        "caller_id": get_setting(db, "sip_caller_id", ""),
        "change_needed_number": get_setting(db, "sip_change_needed_number", ""),
        "fusionpbx_api_url": get_setting(db, "sip_fusionpbx_api_url", ""),
        "fusionpbx_api_key": get_setting(db, "sip_fusionpbx_api_key", ""),
    }


def originate_call(db: Session, destination: str, message: str) -> bool:
    """Originate an outbound call via FusionPBX REST API."""
    config = _get_sip_config(db)
    if config["enabled"] != "true":
        logger.debug("SIP call not sent — SIP disabled")
        return False
    if not config["fusionpbx_api_url"]:
        logger.debug("SIP call not sent — FusionPBX API URL not configured")
        return False

    api_url = config["fusionpbx_api_url"].rstrip("/")
    headers = {
        "Authorization": f"Bearer {config['fusionpbx_api_key']}",
        "Content-Type": "application/json",
    }
    payload = {
        "destination": destination,
        "caller_id_name": config["caller_id"] or "Pool Kiosk",
        "caller_id_number": config["caller_id"] or config["username"] or "",
        "message": message,
        "context": "default",
    }

    try:
        resp = httpx.post(f"{api_url}/calls/originate", headers=headers, json=payload, timeout=10.0)
        if resp.status_code in (200, 201, 202):
            logger.info("SIP call originated: destination=%s", destination)
            return True
        logger.warning("SIP call failed: status=%d, body=%s", resp.status_code, resp.text[:200])
        return False
    except httpx.RequestError as exc:
        logger.exception("SIP call request failed: destination=%s, error=%s", destination, exc)
        return False


def call_for_change_needed(db: Session, member_name: str, amount: str) -> bool:
    """Convenience: call staff for change needed notification."""
    config = _get_sip_config(db)
    number = config["change_needed_number"]
    if not number:
        logger.debug("SIP change call skipped — no change_needed_number configured")
        return False
    message = f"Change needed: {member_name} needs ${amount} change at the pool kiosk"
    return originate_call(db, number, message)


def test_sip_connection(db: Session) -> tuple[bool, str]:
    """Verify FusionPBX API connectivity."""
    config = _get_sip_config(db)
    if config["enabled"] != "true":
        return False, "SIP is disabled"
    if not config["fusionpbx_api_url"]:
        return False, "FusionPBX API URL not configured"

    api_url = config["fusionpbx_api_url"].rstrip("/")
    headers = {
        "Authorization": f"Bearer {config['fusionpbx_api_key']}",
        "Content-Type": "application/json",
    }

    try:
        resp = httpx.get(f"{api_url}/status", headers=headers, timeout=10.0)
        if resp.status_code == 200:
            return True, "FusionPBX API connected successfully"
        return False, f"FusionPBX API returned status {resp.status_code}"
    except httpx.RequestError as exc:
        return False, f"FusionPBX connection failed: {exc}"
