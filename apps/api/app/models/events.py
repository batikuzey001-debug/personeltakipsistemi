from datetime import datetime
from sqlalchemy import BigInteger, Integer, String, DateTime, JSON, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column
from app.db.base import Base

class RawMessage(Base):
    __tablename__ = "raw_messages"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    update_id: Mapped[int | None]
    chat_id: Mapped[int] = mapped_column(BigInteger, index=True)
    msg_id: Mapped[int] = mapped_column(Integer)
    from_user_id: Mapped[int | None]
    from_username: Mapped[str | None]
    ts: Mapped[datetime]
    channel_tag: Mapped[str] = mapped_column(String(24))   # bonus|finans|mesai|other
    kind: Mapped[str] = mapped_column(String(24))          # msg|reply|edit|channel_post
    json: Mapped[dict] = mapped_column(JSON)
    inserted_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    __table_args__ = (UniqueConstraint("chat_id","msg_id", name="uq_rawmsg_chat_msg"),)

class Event(Base):
    __tablename__ = "events"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    source_channel: Mapped[str] = mapped_column(String(16), index=True)  # bonus|finans|mesai|other
    type: Mapped[str] = mapped_column(String(24), index=True)            # origin|reply_first|reply_close|approve|reject|note|check_in|check_out
    chat_id: Mapped[int] = mapped_column(BigInteger, index=True)
    msg_id: Mapped[int] = mapped_column(Integer)
    correlation_id: Mapped[str] = mapped_column(String(128), index=True) # f"{chat_id}:{origin_msg_id}"
    ts: Mapped[datetime] = mapped_column(DateTime, index=True)
    from_user_id: Mapped[int | None]
    from_username: Mapped[str | None]
    employee_id: Mapped[str | None]
    payload_json: Mapped[dict] = mapped_column(JSON)
    inserted_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    __table_args__ = (UniqueConstraint("correlation_id","type", name="uq_event_corr_type"),)
