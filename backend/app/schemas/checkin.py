import uuid
from datetime import datetime

from pydantic import BaseModel

from app.models.checkin import CheckinType


class CheckinCreate(BaseModel):
    member_id: uuid.UUID
    membership_id: uuid.UUID | None = None
    checkin_type: CheckinType | None = None
    guest_count: int = 0
    notes: str | None = None


class CheckinResponse(BaseModel):
    id: uuid.UUID
    member_id: uuid.UUID
    membership_id: uuid.UUID | None
    checkin_type: CheckinType
    guest_count: int
    checked_in_at: datetime
    notes: str | None

    model_config = {"from_attributes": True}


class CheckinWithMemberResponse(BaseModel):
    id: uuid.UUID
    member_id: uuid.UUID | None
    member_name: str
    membership_id: uuid.UUID | None
    checkin_type: CheckinType | str
    guest_count: int
    checked_in_at: datetime
    notes: str | None
    is_guest: bool = False


class CheckinListResponse(BaseModel):
    items: list[CheckinWithMemberResponse]
    total: int
    page: int
    per_page: int
    unique_members: int | None = None
