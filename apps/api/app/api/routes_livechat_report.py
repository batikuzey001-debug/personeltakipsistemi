# apps/api/app/api/routes_livechat_report.py
import os, httpx
from fastapi import APIRouter, HTTPException, Query

LC = "https://api.livechatinc.com/v3.6"
LC_V35 = os.getenv("TEXT_API_URL", "https://api.livechatinc.com/v3.5")
B64 = os.getenv("TEXT_BASE64_TOKEN", "")
if not B64:
    raise HTTPException(401, "TEXT_BASE64_TOKEN missing")

HDR = {"Authorization": f"Basic {B64}", "Content-Type": "application/json", "X-API-Version": "3.6"}
HDR_V35 = {"Authorization": f"Basic {B64}", "Content-Type": "application/json"}

router = APIRouter(prefix="/report", tags=["livechat-report"])

def _day(d: str) -> tuple[str, str]:
    d = d[:10]
    return f"{d}T00:00:00Z", f"{d}T23:59:59Z"

# ---------- ART (ajan bazlı) ----------
async def _agent_art(c: httpx.AsyncClient, fr: str, to: str, email: str) -> float | None:
    q = {"filters.from": fr, "filters.to": to, "filters.agents.values": email}
    r = await c.get(f"{LC}/reports/chats/response_time", headers=HDR, params=q, timeout=60)
    if r.status_code != 200:
        return None
    recs = r.json().get("records") or {}
    for _, v in recs.items():
        return v.get("response_time")
    return None

# ---------- v3.5 supervise yardımcıları ----------
async def _list_chats_summary_all(c: httpx.AsyncClient, fr: str, to: str, page_size=100, hard_cap=20000):
    url = f"{LC_V35}/agent/action/list_chats"
    payload = {"filters": {"date_from": fr, "date_to": to}, "pagination": {"page": 1, "limit": page_size}}
    out = []
    while True:
        r = await c.post(url, headers=HDR_V35, json=payload, timeout=60)
        if r.status_code != 200:
            raise HTTPException(r.status_code, r.text)
        j = r.json()
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

async def _list_threads(c: httpx.AsyncClient, chat_id: str):
    r = await c.post(f"{LC_V35}/agent/action/list_threads", headers=HDR_V35, json={"chat_id": chat_id}, timeout=60)
    if r.status_code != 200:
        return []
    return r.json().get("threads") or []

def _authors_and_internal_chat_flag(threads: list[dict]) -> tuple[set[str], set[str]]:
    """authors: bu chatte yazan tüm ajanlar; internal_authors: bu chatte iç mesaj yazan ajanlar."""
    authors, internal_authors = set(), set()
    for th in threads:
        for ev in th.get("events", []):
            em = ev.get("author_id")
            if em and "@" in em:
                authors.add(em)
                if ev.get("visibility") == "agents":
                    internal_authors.add(em)
    return authors, internal_authors

@router.get("/daily")
async def daily_summary(date: str = Query(..., description="YYYY-MM-DD (tek gün)")):
    fr, to = _day(date)
    async with httpx.AsyncClient(timeout=60) as c:
        # 1) performans
        pb = {"distribution": "day", "filters": {"from": fr, "to": to}}
        r1 = await c.post(f"{LC}/reports/agents/performance", headers=HDR, json=pb)
        r1.raise_for_status()
        perf = r1.json().get("records", {})  # {email:{...}}

        # 2) rating
        rb = {"filters": {"from": fr, "to": to}}
        r2 = await c.post(f"{LC}/reports/chats/ranking", headers=HDR, json=rb)
        r2.raise_for_status()
        rank = r2.json().get("records", {})

        # 3) transfer_out (ajan bazlı)
        transfer_out = {}
        for email in perf.keys():
            q = {
                "filters.from": fr, "filters.to": to,
                "filters.event_types.values": "chat_transferred",
                "filters.agents.values": email, "distribution": "day",
            }
            r4 = await c.get(f"{LC}/reports/chats/total_chats", headers=HDR, params=q)
            if r4.status_code == 200:
                recs = r4.json().get("records") or {}
                transfer_out[email] = int((recs.get(date[:10]) or {}).get("total") or 0)
            else:
                transfer_out[email] = 0

        # 4) supervise & internal — tüm sayfaları tara, chat-adedi bazlı say
        summary = await _list_chats_summary_all(c, fr, to, page_size=100, hard_cap=20000)
        sup_map, int_map = {}, {}
        for ch in summary:
            cid = ch.get("id")
            if not cid:
                continue
            ths = await _list_threads(c, cid)
            authors, internal_authors = _authors_and_internal_chat_flag(ths)

            # supervise: 2+ farklı ajan yazmışsa → bu chatte yazan HER ajan için +1
            if len(authors) > 1:
                for em in authors:
                    sup_map[em] = sup_map.get(em, 0) + 1

            # internal: bu chatte 'visibility: agents' yazmış HER ajan için +1 (mesaj adedi değil, chat adedi)
            for em in internal_authors:
                int_map[em] = int_map.get(em, 0) + 1

        # 5) ajan bazlı ART
        art_map = {}
        for email in perf.keys():
            art_map[email] = await _agent_art(c, fr, to, email)

    # birleşik çıktı
    rows = []
    for email, p in perf.items():
        chats = int(p.get("chats_count") or 0)
        frt = p.get("first_response_time")
        chat_sec = int(p.get("chatting_time") or 0)
        aht = (chat_sec / chats) if chats else None
        li = int(p.get("logged_in_time") or 0)
        ac = int(p.get("accepting_chats_time") or 0)
        nac = int(p.get("not_accepting_chats_time") or 0)
        rr = rank.get(email, {})
        good, bad, tot = rr.get("good"), rr.get("bad"), rr.get("total")
        csat = (good / tot * 100) if (isinstance(good, (int, float)) and isinstance(tot, (int, float)) and tot) else None

        rows.append({
            "agent_email": email,
            "total_chats": chats,
            "first_response_time_sec": frt,
            "avg_response_time_sec": art_map.get(email),
            "avg_handle_time_sec": aht,
            "csat_good": good, "csat_bad": bad, "csat_total": tot,
            "csat_percent": round(csat, 2) if csat is not None else None,
            "logged_in_hours": round(li / 3600, 2) if li else 0,
            "accepting_hours": round(ac / 3600, 2) if ac else 0,
            "not_accepting_hours": round(nac / 3600, 2) if nac else 0,
            "chatting_hours": round(chat_sec / 3600, 2) if chat_sec else 0,
            "transfer_out": transfer_out.get(email, 0),
            "supervised_chats": sup_map.get(email, 0),
            "internal_msg_count": int_map.get(email, 0),
        })

    return {"date": date[:10], "count": len(rows), "rows": rows}
