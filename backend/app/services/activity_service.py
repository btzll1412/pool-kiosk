import logging
import uuid

from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

from app.models.activity_log import ActivityLog


def log_activity(
    db: Session,
    user_id: uuid.UUID | None,
    action: str,
    entity_type: str,
    entity_id: uuid.UUID | None = None,
    before: dict | None = None,
    after: dict | None = None,
    note: str | None = None,
) -> ActivityLog:
    entry = ActivityLog(
        user_id=user_id,
        action_type=action,
        entity_type=entity_type,
        entity_id=entity_id,
        before_value=before,
        after_value=after,
        note=note,
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    logger.debug("Activity logged: action=%s, entity=%s/%s, user=%s", action, entity_type, entity_id, user_id)
    return entry
