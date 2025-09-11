from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.deps import get_db
from app.models.events import RawMessage, Event

router = APIRouter(prefix="/debug", tags=["debug"])

@router.get("/events/stats")
def events_stats(db: Session = Depends(get_db)):
    total_raw = db.query(func.count(RawMessage.id)).scalar() or 0
    total_evt = db.query(func.count(Event.id)).scalar() or 0
    by_type = {t: c for (t, c) in db.query(Event.type, func.count(Event.id)).group_by(Event.type).all()}
    by_ch   = {t: c for (t, c) in db.query(Event.source_channel, func.count(Event.id)).group_by(Event.source_channel).all()}
    return {"raw": total_raw, "events": total_evt, "by_type": by_type, "by_channel": by_ch}

@router.get("/events/last")
def events_last(limit: int = Query(10, ge=1, le=100), db: Session = Depends(get_db)):
    rows = db.query(Event).order_by(Event.inserted_at.desc()).limit(limit).all()
    # Basit serialize
    return [
        {
            "id": r.id,
            "type": r.type,
            "channel": r.source_channel,
            "chat_id": r.chat_id,
            "msg_id": r.msg_id,
            "corr": r.correlation_id,
            "ts": r.ts.isoformat(),
            "from": r.from_username or r.from_user_id,
            "payload": r.payload_json,
        }
        for r in rows
    ]
