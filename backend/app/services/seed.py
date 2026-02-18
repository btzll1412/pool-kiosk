from sqlalchemy.orm import Session

from app.config import settings
from app.models.setting import Setting
from app.models.user import User, UserRole
from app.services.auth_service import hash_password
from app.services.settings_service import DEFAULT_SETTINGS


def create_default_admin(db: Session) -> None:
    existing = db.query(User).filter(User.username == settings.admin_default_username).first()
    if existing:
        return
    admin = User(
        username=settings.admin_default_username,
        password_hash=hash_password(settings.admin_default_password),
        role=UserRole.admin,
    )
    db.add(admin)
    db.commit()


def seed_default_settings(db: Session) -> None:
    for key, value in DEFAULT_SETTINGS.items():
        existing = db.query(Setting).filter(Setting.key == key).first()
        if not existing:
            db.add(Setting(key=key, value=value))
    db.commit()
