import uuid
from datetime import datetime

from pydantic import BaseModel


class CardCreate(BaseModel):
    rfid_uid: str


class CardResponse(BaseModel):
    id: uuid.UUID
    member_id: uuid.UUID
    rfid_uid: str
    is_active: bool
    assigned_at: datetime

    model_config = {"from_attributes": True}
