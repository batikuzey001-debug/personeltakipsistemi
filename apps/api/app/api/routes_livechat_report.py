# apps/api/app/api/routes_livechat_report.py
import os, httpx
from fastapi import APIRouter, HTTPException, Query

LC = os.getenv("TEXT_API_URL", "https://api.livechatinc.com/v3.5")
B64 = os.getenv("TEXT_BASE64_TOKEN", "")
if not B64:
    raise HTTPException(401, "TEXT_BASE64_TOKEN missing")

HDR_JSON = {"Authorization": f"Basic {B64}", "Content-Type": "application/json"}

router = APIRouter(prefix="/report", tags=["livechat-report"])

# ----------------- helpers -----------------
def _date(d: str) -> str:
    return d[:10]

def _iso_bounds(day: str) -> tuple[str, str]:
    d = _date(day)
    return f"{d}T00:00:00Z", f"{d}T23:59:59Z"

async def _agents(c: httpx.AsyncClient):
    r = await c.post(f"{LC}/configuration/action/list_agents", headers=HDR_JSON, json={}, timeout=30)
    if r.status_code != 200:
        raise HTTPException(r.status_code, r.text)
    j = r.json()
    return (j.get("items") or j.get("agents") or j) if isinstance(j, dict) else j

async def _list_chats_all(c: httpx.AsyncClient, f0: str, t1: str, page_limit: int = 5, page_size: int = 100):
    """Tarih aralığındaki chat özetlerini agents filtresi olmadan getir (chats_summary destekli)."""
    url = f"{LC}/agent/action/list_chats"
    payload = {"filters": {"date_from": f0, "date_to": t1}, "pagination": {"page": 1, "limit": page_size}}
    all_items = []
    for _ in range(page_limit):
        r = await c.post(url, headers=HDR_JSON, json=payload, timeout=60)
        if r.status_code != 200:
            break
        j = r.json()
        items = j.get("chats") or j.get("items") or j.get("chats_summary") or []
        all_items.extend(items)
        nxt = j.get("next_page_id")
        if not nxt:
            break
        payload["pagination"]["page"] += 1
        payload["next_page_id"] = nxt
    return all_items

def _assign_agent_email(chat: dict) -> str | None:
    """Chat’i ajana bağla: event author_id e-posta, yoksa users[].email."""
    lep = (chat.get("last_event_per_type") or {})
    for ev in lep.values():
        evt = (ev or {}).get("event") or {}
        aid = evt.get("author_id")
        if aid and "@" in aid:
            return aid
    for u in (chat.get("users") or []):
        if u.get("type") == "agent" and u.get("visibility") == "all":
            return u.get("email") or u.get("id")
    for u in (chat.get("users") or []):
        if u.get("type") == "agent":
            return u.get("email") or u.get("id")
    return None

# ----------------- endpoints -----------------
@router.get("/agents/summary")
async def agents_summary(
    date_from: str = Query(..., description="YYYY-MM-DD or ISO"),
    date_to:   str = Query(..., description="YYYY-MM-DD or ISO"),
):
    dfrom, dto = _date(date_from), _date(date_to)
    f0, t1 = _iso_bounds(dfrom)[0], _iso_bounds(dto)[1]
    async with httpx.AsyncClient() as c:
        ags = await _agents(c)
        meta = {a.get("id"): {"name": a.get("name"), "role": a.get("role")} for a in ags or []}  # id = e-posta

        chats = await _list_chats_all(c, f0, t1, page_limit=5, page_size=100)
        counts: dict[str, int] = {}
        for ch in chats:
            aid = _assign_agent_email(ch)
            if aid:
                counts[aid] = counts.get(aid, 0) + 1

        rows = []
        for aid, info in meta.items():
            rows.append({
                "agent_id": aid,
                "name": info.get("name"),
                "role": info.get("role"),
                "total_chats": counts.get(aid, 0),
                "first_response_time_sec": None,
                "avg_response_time_sec":   None,
                "avg_handle_time_sec":     None,
                "csat_avg":                None,
            })

    return {"range": {"from": dfrom, "to": dto}, "rows": rows, "count": len(rows)}
