import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Card(Base):
    __tablename__ = "cards"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    member_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("members.id"), index=True)
    rfid_uid: Mapped[str] = mapped_column(String(100), unique=True, index=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    assigned_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    member: Mapped["Member"] = relationship("Member", back_populates="cards")
