import uuid
from datetime import datetime, timedelta

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.member import Member
from app.models.pin_lockout import PinLockout
from app.services.auth_service import verify_pin
from app.services.settings_service import get_setting


def verify_member_pin(db: Session, member_id: uuid.UUID, pin: str) -> bool:
    member = db.query(Member).filter(Member.id == member_id).first()
    if not member or not member.pin_hash:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="PIN not set for this member")

    lockout = db.query(PinLockout).filter(PinLockout.member_id == member_id).first()
    max_attempts = int(get_setting(db, "pin_max_attempts", "3"))

    if lockout and lockout.locked_until and lockout.locked_until > datetime.utcnow():
        raise HTTPException(
            status_code=status.HTTP_423_LOCKED,
            detail="Account locked due to too many failed PIN attempts. Contact admin.",
        )

    if verify_pin(pin, member.pin_hash):
        if lockout:
            lockout.failed_attempts = 0
            lockout.locked_until = None
            db.commit()
        return True

    if not lockout:
        lockout = PinLockout(member_id=member_id, failed_attempts=0)
        db.add(lockout)

    lockout.failed_attempts += 1
    lockout.last_attempt_at = datetime.utcnow()

    if lockout.failed_attempts >= max_attempts:
        lockout.locked_until = datetime.utcnow() + timedelta(minutes=30)

    db.commit()
    remaining = max_attempts - lockout.failed_attempts
    if remaining <= 0:
        raise HTTPException(status_code=status.HTTP_423_LOCKED, detail="Account locked. Contact admin.")
    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=f"Invalid PIN. {remaining} attempts remaining.")
