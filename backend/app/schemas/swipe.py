import uuid
from datetime import datetime

from pydantic import BaseModel

from app.models.swipe import SwipeOutcome, SwipeSource


class SwipeResponse(BaseModel):
    id: uuid.UUID
    member_id: uuid.UUID | None
    member_name: str | None
    card_uid: str | None
    source: SwipeSource
    outcome: SwipeOutcome
    checkin_id: uuid.UUID | None
    created_at: datetime


class SwipeListResponse(BaseModel):
    items: list[SwipeResponse]
    total: int
    page: int
    per_page: int
    unique_members: int
    outcome_counts: dict[str, int]
