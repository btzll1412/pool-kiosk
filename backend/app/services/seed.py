import logging

from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

from app.models.setting import Setting
from app.services.settings_service import DEFAULT_SETTINGS


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
