import logging
import logging.handlers
import os
import sys
from contextlib import asynccontextmanager
from datetime import date, timedelta

# Configure logging with both console and file output
LOG_DIR = os.environ.get("LOG_DIR", "/app/logs")
os.makedirs(LOG_DIR, exist_ok=True)

# Create formatters
log_format = logging.Formatter(
    "%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S"
)

# Console handler
console_handler = logging.StreamHandler(sys.stdout)
console_handler.setLevel(logging.INFO)
console_handler.setFormatter(log_format)

# File handler with rotation (10MB, keep 5 backups)
file_handler = logging.handlers.RotatingFileHandler(
    os.path.join(LOG_DIR, "pool-kiosk.log"),
    maxBytes=10*1024*1024,
    backupCount=5,
    encoding="utf-8"
)
file_handler.setLevel(logging.DEBUG)
file_handler.setFormatter(log_format)

# Payment-specific log file for easier debugging
payment_handler = logging.handlers.RotatingFileHandler(
    os.path.join(LOG_DIR, "payments.log"),
    maxBytes=5*1024*1024,
    backupCount=3,
    encoding="utf-8"
)
payment_handler.setLevel(logging.DEBUG)
payment_handler.setFormatter(log_format)

# Configure root logger
root_logger = logging.getLogger()
root_logger.setLevel(logging.DEBUG)
root_logger.addHandler(console_handler)
root_logger.addHandler(file_handler)

# Configure payment-specific loggers with extra detail
for logger_name in ["app.payments", "app.services.payment_service"]:
    payment_logger = logging.getLogger(logger_name)
    payment_logger.addHandler(payment_handler)
    payment_logger.setLevel(logging.DEBUG)

from apscheduler.schedulers.background import BackgroundScheduler
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from sqlalchemy.orm import Session

from app.config import settings
from app.database import SessionLocal
from app.models.membership import Membership
from app.models.plan import PlanType
from app.models.user import User
from app.routers import (
    auth,
    backup,
    cards,
    checkins,
    guests,
    kiosk,
    nfc,
    members,
    memberships,
    payments,
    plans,
    reports,
    schedules,
    settings as settings_router,
    transactions,
)
from app.services.auto_charge_service import process_due_charges
from app.services.notification_service import (
    notify_daily_summary,
    notify_membership_expired,
    notify_membership_expiring,
)
from app.services.rate_limit import limiter
from app.services.report_service import get_dashboard_stats
from app.services.seed import seed_default_settings
from app.services.settings_service import get_setting

logger = logging.getLogger(__name__)


def run_auto_charge_job():
    """Daily job to process auto-charge on saved cards."""
    db = SessionLocal()
    try:
        results = process_due_charges(db)
        logger.info("Auto-charge job completed: %s", results)
    except Exception:
        logger.exception("Auto-charge job failed")
    finally:
        db.close()


def run_membership_expiry_check():
    """Daily job to check for expiring/expired memberships and fire webhooks."""
    db: Session = SessionLocal()
    try:
        warning_days = int(get_setting(db, "membership_expiry_warning_days", "7"))
        today = date.today()
        warning_date = today + timedelta(days=warning_days)

        active_monthly = (
            db.query(Membership)
            .filter(
                Membership.is_active.is_(True),
                Membership.plan_type == PlanType.monthly,
                Membership.valid_until.isnot(None),
            )
            .all()
        )

        expiring_count = 0
        expired_count = 0

        for m in active_monthly:
            member = m.member
            if not member:
                continue
            member_name = f"{member.first_name} {member.last_name}"
            plan_name = m.plan.name if m.plan else "Monthly"

            if m.valid_until < today:
                notify_membership_expired(db, member_name, str(member.id), plan_name)
                if member.email:
                    from app.services.email_service import send_membership_expired_email
                    send_membership_expired_email(db, member.email, member_name, plan_name)
                expired_count += 1
            elif m.valid_until <= warning_date:
                days_remaining = (m.valid_until - today).days
                notify_membership_expiring(db, member_name, str(member.id), days_remaining, plan_name)
                if member.email:
                    from app.services.email_service import send_membership_expiring_email
                    send_membership_expiring_email(db, member.email, member_name, plan_name, days_remaining)
                expiring_count += 1

        logger.info("Membership expiry check: %d expiring, %d expired", expiring_count, expired_count)
    except Exception:
        logger.exception("Membership expiry check failed")
    finally:
        db.close()


def run_daily_summary():
    """Daily job to send a summary webhook with today's stats."""
    db: Session = SessionLocal()
    try:
        stats = get_dashboard_stats(db)
        pool_name = get_setting(db, "pool_name", "Pool")
        notify_daily_summary(db, {
            "pool_name": pool_name,
            "date": str(date.today()),
            "total_checkins_today": stats["total_checkins_today"],
            "unique_members_today": stats["unique_members_today"],
            "revenue_today": str(stats["revenue_today"]),
            "active_memberships": stats["active_memberships"],
            "guests_today": stats["guests_today"],
        })
        logger.info("Daily summary webhook sent")
    except Exception:
        logger.exception("Daily summary job failed")
    finally:
        db.close()


def run_scheduled_backup():
    """Scheduled job to run automatic backups based on settings."""
    db: Session = SessionLocal()
    try:
        backup_enabled = get_setting(db, "backup_enabled", "false").lower() == "true"
        if not backup_enabled:
            return

        from app.services.backup_service import run_backup
        result = run_backup(db)
        if result["success"]:
            logger.info("Scheduled backup completed: %s", result.get("location"))
        else:
            logger.error("Scheduled backup failed: %s", result.get("error"))
    except Exception:
        logger.exception("Scheduled backup job failed")
    finally:
        db.close()


@asynccontextmanager
async def lifespan(app: FastAPI):
    if not getattr(app.state, "testing", False):
        db = SessionLocal()
        try:
            seed_default_settings(db)
        finally:
            db.close()

        scheduler = BackgroundScheduler()
        scheduler.add_job(run_auto_charge_job, "cron", hour=6, minute=0, id="auto_charge_daily")
        scheduler.add_job(run_membership_expiry_check, "cron", hour=7, minute=0, id="membership_expiry_check")
        scheduler.add_job(run_daily_summary, "cron", hour=21, minute=0, id="daily_summary")
        # Run backup check every hour - the job itself checks if it's time based on settings
        scheduler.add_job(run_scheduled_backup, "cron", minute=0, id="scheduled_backup")
        scheduler.start()
        logger.info(
            "APScheduler started — 4 jobs scheduled: auto-charge 06:00, expiry check 07:00, daily summary 21:00, backup hourly"
        )

    yield

    if not getattr(app.state, "testing", False):
        scheduler.shutdown(wait=False)
        logger.info("APScheduler shut down")


app = FastAPI(
    title="Pool Management System",
    description=f"{settings.pool_name} — Kiosk & Admin API",
    version="1.0.0",
    lifespan=lifespan,
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api/auth", tags=["Auth"])
app.include_router(members.router, prefix="/api/members", tags=["Members"])
app.include_router(cards.router, prefix="/api/members", tags=["Cards"])
app.include_router(plans.router, prefix="/api/plans", tags=["Plans"])
app.include_router(memberships.router, prefix="/api/memberships", tags=["Memberships"])
app.include_router(checkins.router, prefix="/api/checkins", tags=["Checkins"])
app.include_router(payments.router, prefix="/api/payments", tags=["Payments"])
app.include_router(transactions.router, prefix="/api/transactions", tags=["Transactions"])
app.include_router(reports.router, prefix="/api/reports", tags=["Reports"])
app.include_router(guests.router, prefix="/api/guests", tags=["Guests"])
app.include_router(settings_router.router, prefix="/api/settings", tags=["Settings"])
app.include_router(backup.router, prefix="/api/backup", tags=["Backup"])
app.include_router(schedules.router, prefix="/api/schedules", tags=["Schedules"])
app.include_router(kiosk.router, prefix="/api/kiosk", tags=["Kiosk"])
app.include_router(nfc.router, prefix="/api/nfc", tags=["NFC"])

# Serve uploaded files
import os
UPLOAD_DIR = "/app/uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)
app.mount("/api/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")


@app.get("/api/health")
def health_check():
    return {"status": "ok"}
