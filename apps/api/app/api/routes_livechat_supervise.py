# apps/api/app/api/routes_livechat_supervise.py
import os, httpx
from fastapi import APIRouter, HTTPException, Query

LC = os.getenv("TEXT_API_URL", "https://api.livechatinc.com/v3.5")
B64 = os.getenv("TEXT_BASE64_TOKEN", "")
if not B64:
    raise HTTPException(401, "TEXT_BASE64_TOKEN missing")

HDR = {"Authorization": f"Basic {B64}", "Content-Type": "application/json"}
router = APIRouter(prefix="/report", tags=["livechat-supervise"])

# --- helpers ---
def _iso_bounds(day: str) -> tuple[str, str]:
    d = day[:10]
    return f"{d}T00:00:00Z", f"{d}T23:59:59Z"

async def _list_chats(c: httpx.AsyncClient, f0: str, t1: str, page_limit=50, page_size=100):
    """v3.5 özet (chats_summary) sayfalı çekim."""
    url = f"{LC}/agent/action/list_chats"
    payload = {"filters": {"date_from": f0, "date_to": t1}, "pagination": {"page": 1, "limit": page_size}}
    out = []
    for _ in range(page_limit):
        r = await c.post(url, headers=HDR, json=payload, timeout=60)
        if r.status_code != 200:
            raise HTTPException(r.status_code, r.text)
        j = r.json()
        items = j.get("chats_summary") or j.get("chats") or j.get("items") or []
        out.extend(items)
        nxt = j.get("next_page_id")
        if not nxt:
            break
        payload["pagination"]["page"] += 1
        payload["next_page_id"] = nxt
    return out

def _agent_emails(chat: dict) -> set[str]:
    emails = set()
    for u in (chat.get("users") or []):
        if u.get("type") == "agent":
            em = u.get("email") or u.get("id")
            if em and "@" in em:
                emails.add(em)
    return emails

def _internal_author_emails(chat: dict) -> set[str]:
    emails = set()
    lep = chat.get("last_event_per_type") or {}
    for ev in lep.values():
        evt = (ev or {}).get("event") or {}
        if evt.get("visibility") == "agents":
            aid = evt.get("author_id")
            if aid and "@" in aid:
                emails.add(aid)
    return emails

def _message_author_email(chat: dict) -> str | None:
    lep = chat.get("last_event_per_type") or {}
    msg = (lep.get("message") or {}).get("event") or {}
    aid = msg.get("author_id")
    return aid if aid and "@" in aid else None

# --- endpoint ---
@router.get("/supervise")
async def supervise_daily(
    date: str = Query(..., description="YYYY-MM-DD (tek gün)"),
):
    f0, t1 = _iso_bounds(date)
    async with httpx.AsyncClient() as c:
        chats = await _list_chats(c, f0, t1, page_limit=50, page_size=100)

    supervised: dict[str, int] = {}
    internal_msgs: dict[str, int] = {}

    for ch in chats:
        agents = _agent_emails(ch)
        author = _message_author_email(ch)  # o sohbet için ajan “sahibi” gibi sayacağız
        internals = _internal_author_emails(ch)

        # supervise: birden fazla ajan yer alıyorsa, mesajı atan ajanın supervise sayaçlarını arttır
        if author and len(agents) > 1:
            supervised[author] = supervised.get(author, 0) + 1

        # internal: visibility=="agents" olan mesaj yazan her ajan için +1
        for em in internals:
            internal_msgs[em] = internal_msgs.get(em, 0) + 1

    # çıktıyı normalize et: her ajan tek satır
    agent_set = set(supervised.keys()) | set(internal_msgs.keys())
    rows = []
    for em in sorted(agent_set):
        rows.append({
            "agent_email": em,
            "supervised_chats": supervised.get(em, 0),
            "internal_msg_count": internal_msgs.get(em, 0),
        })

    return {"date": date[:10], "count": len(rows), "rows": rows}
