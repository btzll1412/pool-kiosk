import logging

from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

from app.config import settings
from app.models.setting import Setting
from app.models.user import User, UserRole
from app.services.auth_service import hash_password
from app.services.settings_service import DEFAULT_SETTINGS


def create_default_admin(db: Session) -> None:
    existing = db.query(User).filter(User.username == settings.admin_default_username).first()
    if existing:
        logger.debug("Default admin already exists, skipping seed")
        return
    admin = User(
        username=settings.admin_default_username,
        password_hash=hash_password(settings.admin_default_password),
        role=UserRole.admin,
    )
    db.add(admin)
    db.commit()
    logger.info("Default admin user created: %s", settings.admin_default_username)


def seed_default_settings(db: Session) -> None:
    created = 0
    for key, value in DEFAULT_SETTINGS.items():
        existing = db.query(Setting).filter(Setting.key == key).first()
        if not existing:
            db.add(Setting(key=key, value=value))
            created += 1
    db.commit()
    if created:
        logger.info("Seeded %d default settings", created)
    else:
        logger.debug("All default settings already exist, skipping seed")
