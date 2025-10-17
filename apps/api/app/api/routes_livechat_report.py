# apps/api/app/api/routes_livechat_report.py
# (Dosyaya EK ENDPOINT — v3.5 ile missed chat DETAYI: chat_id + süre)
import os, httpx
from fastapi import APIRouter, HTTPException, Query

LC_V35 = os.getenv("TEXT_API_URL", "https://api.livechatinc.com/v3.5")
B64 = os.getenv("TEXT_BASE64_TOKEN", "")
if not B64:
    raise HTTPException(401, "TEXT_BASE64_TOKEN missing")

HDR_V35 = {"Authorization": f"Basic {B64}", "Content-Type": "application/json"}

# Europe/Istanbul günü (UTC+03:00 offset) — v3.6 timezone hatasını yaşamamak için
def _day_ist_bounds(d: str) -> tuple[str, str]:
    d = d[:10]
    return f"{d}T00:00:00+03:00", f"{d}T23:59:59+03:00"

def _iso_to_epoch_s(ts: str | None) -> float | None:
    if not ts or not isinstance(ts, str):
        return None
    # RFC3339 'Z' → '+00:00'
    t = ts.replace("Z", "+00:00")
    try:
        from datetime import datetime
        return datetime.fromisoformat(t).timestamp()
    except Exception:
        return None

async def _v35_list_chats_all(c: httpx.AsyncClient, fr: str, to: str, page_size=100, hard_cap=10000):
    """/agent/action/list_chats — tüm sayfalar (özet)."""
    url = f"{LC_V35}/agent/action/list_chats"
    payload = {"filters": {"date_from": fr, "date_to": to}, "pagination": {"page": 1, "limit": page_size}}
    out = []
    while True:
        r = await c.post(url, headers=HDR_V35, json=payload, timeout=60)
        if r.status_code != 200:
            raise HTTPException(r.status_code, r.text)
        j = r.json() or {}
        items = j.get("chats_summary") or j.get("chats") or j.get("items") or []
        out.extend(items)
        if len(out) >= hard_cap:
            break
        nxt = j.get("next_page_id")
        if not nxt:
            break
        payload["pagination"]["page"] += 1
        payload["next_page_id"] = nxt
    return out[:hard_cap]

async def _v35_list_threads(c: httpx.AsyncClient, chat_id: str):
    """/agent/action/list_threads — sohbetin tüm event’leri."""
    r = await c.post(f"{LC_V35}/agent/action/list_threads", headers=HDR_V35, json={"chat_id": chat_id}, timeout=60)
    if r.status_code != 200:
        return []
    return r.json().get("threads") or []

def _chat_agents(chat: dict) -> set[str]:
    """Sohbete dahil ajan e-postaları (users[].type=='agent')."""
    out = set()
    for u in (chat.get("users") or []):
        if u.get("type") == "agent":
            em = u.get("email") or u.get("id")
            if em and "@" in em:
                out.add(em)
    return out

def _missed_for_agent(threads: list[dict], agent_email: str) -> tuple[bool, float | None, str | None, str | None]:
    """
    Bir ajan için 'missed' sayılır mı?
      - Ajan hiç mesaj yazmamışsa True
      - Süre = first_customer_ts → end_ts
      - end_reason = son system_message.system_message_type (varsa)
      - started_at / ended_at iso
    """
    first_customer_ts = None
    ended_at = None
    end_reason = None
    agent_replied = False

    for th in threads:
        for ev in th.get("events", []):
            et = ev.get("type")
            aid = ev.get("author_id")
            created = ev.get("created_at")
            # bitiş zamanı: son event
            ct = _iso_to_epoch_s(created)
            if ct is not None:
                if ended_at is None or ct > _iso_to_epoch_s(ended_at):
                    ended_at = created
            # end reason (varsa)
            if et == "system_message" and ev.get("system_message_type"):
                end_reason = ev.get("system_message_type")
            # ilk müşteri mesajı: author_id '@' içermeyen 'message'
            if et == "message" and aid and "@" not in aid:
                if first_customer_ts is None:
                    first_customer_ts = created
            # ajan yanıtı: author_id = ajan e-postası
            if et in ("message", "file", "annotation", "system_message") and aid == agent_email:
                agent_replied = True

    if agent_replied:
        return (False, None, None, None)

    # ajan hiç yazmadıysa missed say — süreyi hesapla
    if first_customer_ts and ended_at:
        dur = _iso_to_epoch_s(ended_at) - _iso_to_epoch_s(first_customer_ts)
        dur = max(dur or 0, 0)
        return (True, dur, first_customer_ts, ended_at)

    # eksik log: yine missed fakat süre bilinmiyor
    return (True, None, first_customer_ts, ended_at)

@router.get("/missed/details")
async def missed_details(
    date: str = Query(..., description="YYYY-MM-DD (Europe/Istanbul günü)"),
    agent: str = Query(..., description="Ajan e-postası (zorunlu)"),
    limit: int = Query(500, ge=1, le=500),
):
    """
    v3.5 ham loglardan 'missed' sohbet detayları:
    - chat_id
    - missed_duration_sec (first_customer → end)
    - started_at / ended_at
    - end_reason (varsa)
    Not: agent paramı zorunlu (ajan özelinde doğru sayım için).
    """
    if "@" not in agent:
        raise HTTPException(400, "agent must be an email")

    fr, to = _day_ist_bounds(date)

    async with httpx.AsyncClient(timeout=60) as c:
        chats = await _v35_list_chats_all(c, fr, to, page_size=100, hard_cap=10000)

        rows = []
        for ch in chats:
            cid = ch.get("id")
            if not cid:
                continue

            # Bu chatte ilgili ajan var mı?
            agents_in_chat = _chat_agents(ch)
            if agent not in agents_in_chat:
                continue

            # Thread/evenleri oku
            ths = await _v35_list_threads(c, cid)
            is_missed, dur, started_at, ended_at = _missed_for_agent(ths, agent)

            if not is_missed:
                continue

            # Çıkış sebebi (son system_message_type), yoksa 'unknown'
            end_reason = None
            for th in ths:
                for ev in (th.get("events") or []):
                    if ev.get("type") == "system_message" and ev.get("system_message_type"):
                        end_reason = ev.get("system_message_type")

            rows.append({
                "chat_id": cid,
                "agent_email": agent,
                "missed_duration_sec": int(dur) if dur is not None else None,
                "started_at": started_at,
                "ended_at": ended_at,
                "end_reason": end_reason or "unknown",
            })
            if len(rows) >= limit:
                break

    return {
        "date": date[:10],
        "agent": agent,
        "count": len(rows),
        "rows": rows,
    }
