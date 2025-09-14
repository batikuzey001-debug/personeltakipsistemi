from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from datetime import datetime, timezone
import re

from app.deps import get_db
from app.core.config import settings
from app.models.events import RawMessage, Event

router = APIRouter(prefix="/integrations/telegram", tags=["integrations"])

def _norm(s: str) -> str:
    return (s or "").lower().replace("ı","i").replace("ş","s").replace("ğ","g").replace("ç","c").replace("ö","o").replace("ü","u")

def _first_match(text: str) -> bool:
    s = _norm(text)
    return (re.search(r"(?:^|\s)k(?:\s|$)", s) or re.search(r"\bk\s*t+\b", s) or re.search(r"\bkt+\b", s)
            or "bakiyorum" in s or "ilgileniyorum" in s or re.search(r"kontrol(\s+ediyorum)?", s))

APPROVE_PAT = [r"\bonay\b", r"onayland[ıi]", r"\btamam\b", r"\bok\b", "✅", "👍"]
REJECT_PAT  = [r"\bred\b", r"\biptal\b", r"\bolumsuz\b", r"\bhata\b", "❌", "🚫"]

def _is_approve(text: str) -> bool: s=_norm(text); return any(re.search(p, s) for p in APPROVE_PAT)
def _is_reject(text: str) -> bool:  s=_norm(text); return any(re.search(p, s) for p in REJECT_PAT)

def _idset(csv: str) -> set[int]:
    return set(int(x.strip()) for x in (csv or "").split(",") if x.strip())

BONUS_IDS  = _idset(settings.TG_BONUS_CHAT_IDS)
FINANS_IDS = _idset(settings.TG_FINANS_CHAT_IDS)
MESAI_ID   = int(settings.TG_MESAI_CHAT_ID) if (settings.TG_MESAI_CHAT_ID or "").strip() else None

def _channel_tag(chat_id: int) -> str:
    if chat_id in BONUS_IDS: return "bonus"
    if chat_id in FINANS_IDS: return "finans"
    if MESAI_ID and chat_id == MESAI_ID: return "mesai"
    return "other"

@router.post("/webhook/{secret}")
async def webhook(secret: str, request: Request, db: Session = Depends(get_db)):
    if secret != settings.TELEGRAM_WEBHOOK_SECRET:
        raise HTTPException(status_code=403, detail="forbidden")

    upd = await request.json()
    msg = upd.get("message") or upd.get("edited_message") or upd.get("channel_post") or upd.get("edited_channel_post")
    if not msg: return {"ok": True}

    chat_id = int((msg.get("chat") or {}).get("id"))
    msg_id  = int(msg.get("message_id"))
    from_user = msg.get("from") or {}
    from_uid  = from_user.get("id")
    from_uname= ("@" + from_user.get("username")) if from_user.get("username") else None
    text = (msg.get("text") or msg.get("caption") or "")[:2000]
    ts = datetime.fromtimestamp(int(msg.get("date", 0)), tz=timezone.utc)
    kind = "reply" if msg.get("reply_to_message") else "msg"
    channel_tag = _channel_tag(chat_id)

    # raw_messages (idempotent)
    if not db.query(RawMessage).filter_by(chat_id=chat_id, msg_id=msg_id).first():
        db.add(RawMessage(
            update_id=upd.get("update_id"), chat_id=chat_id, msg_id=msg_id,
            from_user_id=from_uid, from_username=from_uname, ts=ts,
            channel_tag=channel_tag, kind=kind, json=upd
        ))

    # correlation
    origin = msg.get("reply_to_message") or None
    origin_id = origin.get("message_id") if origin else msg_id
    correlation_id = f"{chat_id}:{origin_id}"

    # classify
    if channel_tag in ("bonus","finans"):
        if not origin:
            ev_type, payload = "origin", {"talep_text": text}
        else:
            if _first_match(text): ev_type = "reply_first"
            elif _is_reject(text): ev_type = "reject"
            elif _is_approve(text): ev_type = "approve"
            else: ev_type = "reply_close"
            payload = {"text": text}
       elif channel_tag == "mesai":
        # Mesai mesajlarını parse et
        text_norm = text.strip()
        # Regex: "13.09.25 Ali Giriş 00/08"
        import re
        m = re.match(r"(\d{1,2}\.\d{1,2}\.\d{2})\s+(.+?)\s+(G[çÇ]ıkış|G[İi]riş)\s+(\d{1,2})[/:](\d{1,2})", text_norm)
        if m:
            tarih, isim, islem_raw, sa1, sa2 = m.groups()
            islem = "check_in" if "giriş" in islem_raw.lower() else "check_out"
            ev_type, payload = islem, {
                "person": isim,
                "plan_start": f"{sa1}:00",
                "plan_end": f"{sa2}:00",
                "raw": text_norm,
            }
        else:
            ev_type, payload = "note", {"text": text_norm}

    # events (idempotent corr_id+type)
    exists = db.query(Event).filter_by(correlation_id=correlation_id, type=ev_type).first()
    if not exists:
        db.add(Event(
            source_channel=channel_tag, type=ev_type, chat_id=chat_id, msg_id=msg_id,
            correlation_id=correlation_id, ts=ts, from_user_id=from_uid,
            from_username=from_uname, employee_id=None, payload_json=payload
        ))

    db.commit()
    return {"ok": True, "stored": True, "type": ev_type, "channel": channel_tag}
