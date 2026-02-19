import logging
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from sqlalchemy.orm import Session

from app.services.settings_service import get_setting

logger = logging.getLogger(__name__)


def _get_smtp_config(db: Session) -> dict[str, str]:
    return {
        "host": get_setting(db, "email_smtp_host", ""),
        "port": get_setting(db, "email_smtp_port", "587"),
        "username": get_setting(db, "email_smtp_username", ""),
        "password": get_setting(db, "email_smtp_password", ""),
        "from_address": get_setting(db, "email_from_address", ""),
        "from_name": get_setting(db, "email_from_name", "Pool Management"),
        "tls_enabled": get_setting(db, "email_tls_enabled", "true"),
    }


def send_email(db: Session, to: str, subject: str, body_html: str) -> bool:
    """Send an email via SMTP using DB-stored config. Returns True on success."""
    config = _get_smtp_config(db)
    if not config["host"] or not config["from_address"]:
        logger.debug("Email not sent — SMTP not configured")
        return False

    msg = MIMEMultipart("alternative")
    msg["From"] = f"{config['from_name']} <{config['from_address']}>"
    msg["To"] = to
    msg["Subject"] = subject
    msg.attach(MIMEText(body_html, "html"))

    try:
        port = int(config["port"])
        if config["tls_enabled"] == "true":
            server = smtplib.SMTP(config["host"], port, timeout=15)
            server.starttls()
        else:
            server = smtplib.SMTP(config["host"], port, timeout=15)

        if config["username"] and config["password"]:
            server.login(config["username"], config["password"])

        server.sendmail(config["from_address"], [to], msg.as_string())
        server.quit()
        logger.info("Email sent: to=%s, subject=%s", to, subject)
        return True
    except Exception as exc:
        logger.exception("Email send failed: to=%s, subject=%s, error=%s", to, subject, exc)
        return False


def test_email_connection(db: Session) -> tuple[bool, str]:
    """Verify SMTP credentials by connecting and authenticating."""
    config = _get_smtp_config(db)
    if not config["host"]:
        return False, "SMTP host not configured"

    try:
        port = int(config["port"])
        if config["tls_enabled"] == "true":
            server = smtplib.SMTP(config["host"], port, timeout=10)
            server.starttls()
        else:
            server = smtplib.SMTP(config["host"], port, timeout=10)

        if config["username"] and config["password"]:
            server.login(config["username"], config["password"])

        server.quit()
        return True, "SMTP connection successful"
    except smtplib.SMTPAuthenticationError:
        return False, "SMTP authentication failed — check username/password"
    except Exception as exc:
        return False, f"SMTP connection failed: {exc}"


def send_auto_charge_receipt(
    db: Session, to_email: str, member_name: str, plan_name: str, amount: str, card_last4: str
) -> bool:
    """Send a receipt email after a successful auto-charge."""
    subject = f"Auto-Charge Receipt — {plan_name}"
    body = f"""
    <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto;">
        <h2 style="color: #1e40af;">Payment Receipt</h2>
        <p>Hi {member_name},</p>
        <p>Your recurring membership has been renewed successfully.</p>
        <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
            <tr><td style="padding: 8px 0; color: #6b7280;">Plan</td><td style="padding: 8px 0; font-weight: 600;">{plan_name}</td></tr>
            <tr><td style="padding: 8px 0; color: #6b7280;">Amount</td><td style="padding: 8px 0; font-weight: 600;">${amount}</td></tr>
            <tr><td style="padding: 8px 0; color: #6b7280;">Card</td><td style="padding: 8px 0;">•••• {card_last4}</td></tr>
        </table>
        <p style="color: #6b7280; font-size: 13px;">If you have questions, please contact the front desk.</p>
    </div>
    """
    return send_email(db, to_email, subject, body)


def send_membership_expiring_email(
    db: Session, to_email: str, member_name: str, plan_name: str, days_remaining: int
) -> bool:
    """Send a reminder that a membership is expiring soon."""
    subject = f"Membership Expiring Soon — {days_remaining} day{'s' if days_remaining != 1 else ''} left"
    body = f"""
    <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto;">
        <h2 style="color: #d97706;">Membership Expiring</h2>
        <p>Hi {member_name},</p>
        <p>Your <strong>{plan_name}</strong> membership will expire in <strong>{days_remaining} day{'s' if days_remaining != 1 else ''}</strong>.</p>
        <p>Visit the kiosk or contact staff to renew and keep swimming!</p>
        <p style="color: #6b7280; font-size: 13px;">If you have auto-charge enabled, your membership will renew automatically.</p>
    </div>
    """
    return send_email(db, to_email, subject, body)


def send_membership_expired_email(
    db: Session, to_email: str, member_name: str, plan_name: str
) -> bool:
    """Send a notice that a membership has expired."""
    subject = f"Membership Expired — {plan_name}"
    body = f"""
    <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto;">
        <h2 style="color: #dc2626;">Membership Expired</h2>
        <p>Hi {member_name},</p>
        <p>Your <strong>{plan_name}</strong> membership has expired.</p>
        <p>Visit the kiosk or contact staff to purchase a new plan.</p>
    </div>
    """
    return send_email(db, to_email, subject, body)


def send_password_reset_email(db: Session, to_email: str, token: str) -> bool:
    """Send a password reset email with link."""
    from app.services.settings_service import get_setting

    pool_name = get_setting(db, "pool_name", "Pool Management")
    # Build reset URL - assumes frontend is at same origin
    reset_link = f"/admin/reset-password/{token}"

    subject = f"Password Reset — {pool_name}"
    body = f"""
    <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto;">
        <h2 style="color: #1e40af;">Password Reset Request</h2>
        <p>You requested a password reset for your {pool_name} admin account.</p>
        <p>Click the button below to reset your password. This link expires in 1 hour.</p>
        <p style="margin: 24px 0;">
            <a href="{reset_link}"
               style="display: inline-block; background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: 600;">
                Reset Password
            </a>
        </p>
        <p style="color: #6b7280; font-size: 13px;">
            If you didn't request this, you can safely ignore this email.
        </p>
        <p style="color: #6b7280; font-size: 13px;">
            Or copy and paste this link into your browser:<br>
            <code style="background: #f3f4f6; padding: 2px 6px; border-radius: 4px;">{reset_link}</code>
        </p>
    </div>
    """
    return send_email(db, to_email, subject, body)


def send_username_reminder_email(db: Session, to_email: str, username: str) -> bool:
    """Send a username reminder email."""
    from app.services.settings_service import get_setting

    pool_name = get_setting(db, "pool_name", "Pool Management")

    subject = f"Username Reminder — {pool_name}"
    body = f"""
    <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto;">
        <h2 style="color: #1e40af;">Username Reminder</h2>
        <p>You requested a username reminder for your {pool_name} admin account.</p>
        <p>Your username is: <strong style="font-size: 18px;">{username}</strong></p>
        <p style="margin-top: 24px;">
            <a href="/admin/login"
               style="display: inline-block; background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: 600;">
                Go to Login
            </a>
        </p>
        <p style="color: #6b7280; font-size: 13px; margin-top: 24px;">
            If you didn't request this, you can safely ignore this email.
        </p>
    </div>
    """
    return send_email(db, to_email, subject, body)
