import logging
from datetime import datetime

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

from app.database import get_db
from app.models.activity_log import ActivityLog
from app.models.card import Card
from app.models.checkin import Checkin
from app.models.guest_visit import GuestVisit
from app.models.member import Member
from app.models.membership import Membership
from app.models.membership_freeze import MembershipFreeze
from app.models.pin_lockout import PinLockout
from app.models.plan import Plan
from app.models.saved_card import SavedCard
from app.models.setting import Setting
from app.models.transaction import Transaction
from app.models.user import User
from app.services.auth_service import get_current_user

router = APIRouter()


def serialize_model(obj):
    """Convert a SQLAlchemy model to a dict, handling dates and enums."""
    result = {}
    for column in obj.__table__.columns:
        value = getattr(obj, column.name)
        if value is None:
            result[column.name] = None
        elif hasattr(value, 'isoformat'):
            result[column.name] = value.isoformat()
        elif hasattr(value, 'value'):  # Enum
            result[column.name] = value.value
        else:
            result[column.name] = str(value) if not isinstance(value, (str, int, float, bool)) else value
    return result


@router.get("/export")
def export_system(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Export entire system data as JSON for backup/migration."""
    try:
        export_data = {
            "export_version": "1.0",
            "export_date": datetime.utcnow().isoformat(),
            "data": {
                "settings": [serialize_model(s) for s in db.query(Setting).all()],
                "users": [serialize_model(u) for u in db.query(User).all()],
                "plans": [serialize_model(p) for p in db.query(Plan).all()],
                "members": [serialize_model(m) for m in db.query(Member).all()],
                "cards": [serialize_model(c) for c in db.query(Card).all()],
                "memberships": [serialize_model(m) for m in db.query(Membership).all()],
                "membership_freezes": [serialize_model(f) for f in db.query(MembershipFreeze).all()],
                "transactions": [serialize_model(t) for t in db.query(Transaction).all()],
                "checkins": [serialize_model(c) for c in db.query(Checkin).all()],
                "saved_cards": [serialize_model(c) for c in db.query(SavedCard).all()],
                "guest_visits": [serialize_model(g) for g in db.query(GuestVisit).all()],
                "pin_lockouts": [serialize_model(p) for p in db.query(PinLockout).all()],
                "activity_logs": [serialize_model(a) for a in db.query(ActivityLog).all()],
            }
        }

        logger.info("System export created by user=%s", current_user.id)
        return JSONResponse(
            content=export_data,
            headers={
                "Content-Disposition": f"attachment; filename=pool-backup-{datetime.now().strftime('%Y%m%d-%H%M%S')}.json"
            }
        )
    except Exception as e:
        logger.exception("System export failed")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))


@router.post("/import")
async def import_system(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Import system data from a backup JSON file. WARNING: This replaces all existing data!"""
    import json
    import uuid
    from datetime import date, datetime as dt
    from decimal import Decimal

    from app.models.checkin import CheckinType
    from app.models.plan import PlanType
    from app.models.transaction import PaymentMethod, TransactionType

    try:
        content = await file.read()
        data = json.loads(content.decode('utf-8'))

        if "export_version" not in data or "data" not in data:
            raise HTTPException(status_code=400, detail="Invalid backup file format")

        export_data = data["data"]

        # Clear existing data in reverse dependency order
        db.query(ActivityLog).delete()
        db.query(PinLockout).delete()
        db.query(Checkin).delete()
        db.query(Transaction).delete()
        db.query(MembershipFreeze).delete()
        db.query(SavedCard).delete()
        db.query(Membership).delete()
        db.query(Card).delete()
        db.query(GuestVisit).delete()
        db.query(Member).delete()
        db.query(Plan).delete()
        db.query(User).delete()
        db.query(Setting).delete()
        db.commit()

        def parse_date(val):
            if val is None:
                return None
            if isinstance(val, str):
                return date.fromisoformat(val.split('T')[0]) if 'T' in val else date.fromisoformat(val)
            return val

        def parse_datetime(val):
            if val is None:
                return None
            if isinstance(val, str):
                return dt.fromisoformat(val.replace('Z', '+00:00').replace('+00:00', ''))
            return val

        def parse_uuid(val):
            if val is None:
                return None
            return uuid.UUID(val) if isinstance(val, str) else val

        def parse_decimal(val):
            if val is None:
                return None
            return Decimal(str(val))

        # Import settings
        for s in export_data.get("settings", []):
            db.add(Setting(
                id=parse_uuid(s["id"]),
                key=s["key"],
                value=s["value"],
            ))

        # Import users
        for u in export_data.get("users", []):
            db.add(User(
                id=parse_uuid(u["id"]),
                username=u["username"],
                password_hash=u["password_hash"],
                email=u.get("email"),
                password_reset_token=u.get("password_reset_token"),
                password_reset_expires=parse_datetime(u.get("password_reset_expires")),
                is_active=u.get("is_active", True),
                created_at=parse_datetime(u.get("created_at")) or dt.utcnow(),
            ))

        # Import plans
        for p in export_data.get("plans", []):
            db.add(Plan(
                id=parse_uuid(p["id"]),
                name=p["name"],
                plan_type=PlanType(p["plan_type"]),
                price=parse_decimal(p["price"]),
                swim_count=p.get("swim_count"),
                duration_days=p.get("duration_days"),
                description=p.get("description"),
                display_order=p.get("display_order", 0),
                is_active=p.get("is_active", True),
                created_at=parse_datetime(p.get("created_at")) or dt.utcnow(),
            ))

        # Import members
        for m in export_data.get("members", []):
            db.add(Member(
                id=parse_uuid(m["id"]),
                first_name=m["first_name"],
                last_name=m["last_name"],
                email=m.get("email"),
                phone=m.get("phone"),
                pin_hash=m.get("pin_hash"),
                credit_balance=parse_decimal(m.get("credit_balance", "0")),
                notes=m.get("notes"),
                is_active=m.get("is_active", True),
                created_at=parse_datetime(m.get("created_at")) or dt.utcnow(),
            ))

        db.commit()

        # Import cards
        for c in export_data.get("cards", []):
            db.add(Card(
                id=parse_uuid(c["id"]),
                member_id=parse_uuid(c["member_id"]),
                rfid_uid=c["rfid_uid"],
                is_active=c.get("is_active", True),
                created_at=parse_datetime(c.get("created_at")) or dt.utcnow(),
            ))

        # Import memberships
        for m in export_data.get("memberships", []):
            db.add(Membership(
                id=parse_uuid(m["id"]),
                member_id=parse_uuid(m["member_id"]),
                plan_id=parse_uuid(m.get("plan_id")),
                plan_type=PlanType(m["plan_type"]),
                swims_total=m.get("swims_total"),
                swims_used=m.get("swims_used", 0),
                valid_from=parse_date(m.get("valid_from")),
                valid_until=parse_date(m.get("valid_until")),
                is_active=m.get("is_active", True),
                created_at=parse_datetime(m.get("created_at")) or dt.utcnow(),
            ))

        db.commit()

        # Import membership freezes
        for f in export_data.get("membership_freezes", []):
            db.add(MembershipFreeze(
                id=parse_uuid(f["id"]),
                membership_id=parse_uuid(f["membership_id"]),
                frozen_by=parse_uuid(f.get("frozen_by")),
                freeze_start=parse_date(f["freeze_start"]),
                freeze_end=parse_date(f.get("freeze_end")),
                days_extended=f.get("days_extended", 0),
                reason=f.get("reason"),
                created_at=parse_datetime(f.get("created_at")) or dt.utcnow(),
            ))

        # Import saved cards
        for c in export_data.get("saved_cards", []):
            db.add(SavedCard(
                id=parse_uuid(c["id"]),
                member_id=parse_uuid(c["member_id"]),
                processor_token=c["processor_token"],
                card_last4=c["card_last4"],
                card_brand=c.get("card_brand"),
                friendly_name=c.get("friendly_name"),
                is_default=c.get("is_default", False),
                auto_charge_enabled=c.get("auto_charge_enabled", False),
                auto_charge_plan_id=parse_uuid(c.get("auto_charge_plan_id")),
                next_charge_date=parse_date(c.get("next_charge_date")),
                created_at=parse_datetime(c.get("created_at")) or dt.utcnow(),
            ))

        # Import transactions
        for t in export_data.get("transactions", []):
            db.add(Transaction(
                id=parse_uuid(t["id"]),
                member_id=parse_uuid(t.get("member_id")),
                transaction_type=TransactionType(t["transaction_type"]),
                payment_method=PaymentMethod(t["payment_method"]) if t.get("payment_method") else None,
                amount=parse_decimal(t["amount"]),
                plan_id=parse_uuid(t.get("plan_id")),
                membership_id=parse_uuid(t.get("membership_id")),
                reference_id=t.get("reference_id"),
                notes=t.get("notes"),
                created_at=parse_datetime(t.get("created_at")) or dt.utcnow(),
            ))

        # Import checkins
        for c in export_data.get("checkins", []):
            db.add(Checkin(
                id=parse_uuid(c["id"]),
                member_id=parse_uuid(c["member_id"]),
                membership_id=parse_uuid(c.get("membership_id")),
                checkin_type=CheckinType(c["checkin_type"]),
                guest_count=c.get("guest_count", 0),
                notes=c.get("notes"),
                checked_in_at=parse_datetime(c.get("checked_in_at")) or dt.utcnow(),
            ))

        # Import guest visits
        for g in export_data.get("guest_visits", []):
            db.add(GuestVisit(
                id=parse_uuid(g["id"]),
                name=g["name"],
                phone=g.get("phone"),
                payment_method=PaymentMethod(g["payment_method"]),
                amount_paid=parse_decimal(g["amount_paid"]),
                created_at=parse_datetime(g.get("created_at")) or dt.utcnow(),
            ))

        # Import pin lockouts
        for p in export_data.get("pin_lockouts", []):
            db.add(PinLockout(
                id=parse_uuid(p["id"]),
                member_id=parse_uuid(p["member_id"]),
                failed_attempts=p.get("failed_attempts", 0),
                locked_until=parse_datetime(p.get("locked_until")),
                last_attempt_at=parse_datetime(p.get("last_attempt_at")),
            ))

        # Import activity logs
        for a in export_data.get("activity_logs", []):
            db.add(ActivityLog(
                id=parse_uuid(a["id"]),
                user_id=parse_uuid(a.get("user_id")),
                action_type=a["action_type"],
                entity_type=a.get("entity_type"),
                entity_id=parse_uuid(a.get("entity_id")),
                before_value=a.get("before_value"),
                after_value=a.get("after_value"),
                note=a.get("note"),
                created_at=parse_datetime(a.get("created_at")) or dt.utcnow(),
            ))

        db.commit()

        logger.info("System import completed by user=%s from file=%s", current_user.id, file.filename)

        return {
            "success": True,
            "message": "System restored successfully",
            "stats": {
                "settings": len(export_data.get("settings", [])),
                "users": len(export_data.get("users", [])),
                "plans": len(export_data.get("plans", [])),
                "members": len(export_data.get("members", [])),
                "cards": len(export_data.get("cards", [])),
                "memberships": len(export_data.get("memberships", [])),
                "transactions": len(export_data.get("transactions", [])),
                "checkins": len(export_data.get("checkins", [])),
                "guest_visits": len(export_data.get("guest_visits", [])),
            }
        }

    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON file")
    except Exception as e:
        db.rollback()
        logger.exception("System import failed")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))
