# apps/api/app/api/routes_livechat_report.py
import os, httpx
from fastapi import APIRouter, HTTPException, Query

LC = "https://api.livechatinc.com/v3.6"
LC_V35 = os.getenv("TEXT_API_URL", "https://api.livechatinc.com/v3.5")  # supervise için
B64 = os.getenv("TEXT_BASE64_TOKEN", "")
if not B64:
    raise HTTPException(401, "TEXT_BASE64_TOKEN missing")

HDR = {"Authorization": f"Basic {B64}", "Content-Type": "application/json", "X-API-Version": "3.6"}
HDR_V35 = {"Authorization": f"Basic {B64}", "Content-Type": "application/json"}

router = APIRouter(prefix="/report", tags=["livechat-report"])

def _day(d: str) -> tuple[str, str]:
    d = d[:10]
    return f"{d}T00:00:00Z", f"{d}T23:59:59Z"

# --- supervise yardımcıları (v3.5) ---
async def _list_chats_summary(c: httpx.AsyncClient, f0: str, t1: str, page_limit=30, page_size=100):
    url = f"{LC_V35}/agent/action/list_chats"
    payload = {"filters": {"date_from": f0, "date_to": t1}, "pagination": {"page": 1, "limit": page_size}}
    out = []
    for _ in range(page_limit):
        r = await c.post(url, headers=HDR_V35, json=payload, timeout=60)
        if r.status_code != 200:
            break
        j = r.json()
        items = j.get("chats_summary") or j.get("chats") or j.get("items") or []
        out.extend(items)
        nxt = j.get("next_page_id")
        if not nxt: break
        payload["pagination"]["page"] += 1
        payload["next_page_id"] = nxt
    return out

def _agent_set(chat: dict) -> set[str]:
    s = set()
    for u in (chat.get("users") or []):
        if u.get("type") == "agent":
            em = u.get("email") or u.get("id")
            if em and "@" in em: s.add(em)
    return s

def _internal_authors(chat: dict) -> set[str]:
    lep = chat.get("last_event_per_type") or {}
    emails = set()
    for ev in lep.values():
        evt = (ev or {}).get("event") or {}
        if evt.get("visibility") == "agents":
            aid = evt.get("author_id")
            if aid and "@" in aid: emails.add(aid)
    return emails

def _chat_owner(chat: dict) -> str | None:
    evt = ((chat.get("last_event_per_type") or {}).get("message") or {}).get("event") or {}
    aid = evt.get("author_id")
    return aid if aid and "@" in aid else None

@router.get("/daily")
async def daily_summary(date: str = Query(..., description="YYYY-MM-DD (tek gün)")):
    f, t = _day(date)
    async with httpx.AsyncClient(timeout=60) as c:
        # 1) performans
        perf_body = {"distribution": "day", "filters": {"from": f, "to": t}}
        r1 = await c.post(f"{LC}/reports/agents/performance", headers=HDR, json=perf_body)
        if r1.status_code != 200:
            raise HTTPException(r1.status_code, f"agents/performance -> {r1.text}")
        perf = r1.json().get("records", {})  # {email:{...}}

        # 2) rating
        rank_body = {"filters": {"from": f, "to": t}}
        r2 = await c.post(f"{LC}/reports/chats/ranking", headers=HDR, json=rank_body)
        if r2.status_code != 200:
            raise HTTPException(r2.status_code, f"chats/ranking -> {r2.text}")
        rank = r2.json().get("records", {})  # {email:{total,good,bad,score}}

        # 3) gün genel ART
        art_body = {"filters": {"from": f, "to": t}}
        r3 = await c.post(f"{LC}/reports/chats/response_time", headers=HDR, json=art_body)
        art_day = None
        if r3.status_code == 200:
            rec = (r3.json().get("records") or {}).get(date[:10]) or {}
            art_day = rec.get("response_time")

        # 4) transfer_out (ajan bazlı, hafif istek)
        def _params(email: str) -> dict:
            return {
                "filters.from": f,
                "filters.to": t,
                "filters.event_types.values": "chat_transferred",
                "filters.agents.values": email,
                "distribution": "day",
            }
        transfer_out_map: dict[str, int] = {}
        for email in perf.keys():
            r4 = await c.get(f"{LC}/reports/chats/total_chats", headers=HDR, params=_params(email))
            if r4.status_code == 200:
                recs = r4.json().get("records", {})
                day_rec = recs.get(date[:10]) or {}
                transfer_out_map[email] = int(day_rec.get("total") or 0)
            else:
                transfer_out_map[email] = 0

        # 5) supervise + internal (v3.5 özet üzerinden, detay gerektirmez)
        chats = await _list_chats_summary(c, f, t, page_limit=30, page_size=100)
        sup_map: dict[str, int] = {}
        int_map: dict[str, int] = {}
        for ch in chats:
            agents = _agent_set(ch)
            owner = _chat_owner(ch)
            internals = _internal_authors(ch)

            if owner and len(agents) > 1:
                sup_map[owner] = sup_map.get(owner, 0) + 1
            for em in internals:
                int_map[em] = int_map.get(em, 0) + 1

    # birleştir
    rows = []
    for email, p in perf.items():
        chats_count = int(p.get("chats_count") or 0)
        frt   = p.get("first_response_time")
        chat  = int(p.get("chatting_time") or 0)
        aht   = (chat / chats_count) if chats_count else None
        li    = int(p.get("logged_in_time") or 0)
        ac    = int(p.get("accepting_chats_time") or 0)
        nac   = int(p.get("not_accepting_chats_time") or 0)

        rr    = rank.get(email, {})
        good, bad, tot = rr.get("good"), rr.get("bad"), rr.get("total")
        csat = (good / tot * 100) if (isinstance(good,(int,float)) and isinstance(tot,(int,float)) and tot) else None

        rows.append({
            "agent_email": email,
            "total_chats": chats_count,
            "first_response_time_sec": frt,
            "avg_response_time_sec": art_day,         # gün genel ART
            "avg_handle_time_sec": aht,
            "csat_good": good, "csat_bad": bad, "csat_total": tot,
            "csat_percent": round(csat, 2) if csat is not None else None,
            "logged_in_hours": round(li/3600, 2) if li else 0,
            "accepting_hours": round(ac/3600, 2) if ac else 0,
            "not_accepting_hours": round(nac/3600, 2) if nac else 0,
            "chatting_hours": round(chat/3600, 2) if chat else 0,
            "transfer_out": transfer_out_map.get(email, 0),
            "supervised_chats": sup_map.get(email, 0),
            "internal_msg_count": int_map.get(email, 0),
        })

    return {"date": date[:10], "count": len(rows), "rows": rows}
