# apps/api/app/api/routes_livechat_report.py
import os, httpx
from fastapi import APIRouter, HTTPException, Query

# ---- v3.6 RAPORLAR (özet metrikler) ----
LC = "https://api.livechatinc.com/v3.6"
# ---- v3.5 (ham chat detayları) ----
LC_V35 = os.getenv("TEXT_API_URL", "https://api.livechatinc.com/v3.5")

B64 = os.getenv("TEXT_BASE64_TOKEN", "")
if not B64:
    raise HTTPException(401, "TEXT_BASE64_TOKEN missing")

HDR = {
    "Authorization": f"Basic {B64}",
    "Content-Type": "application/json",
    "X-API-Version": "3.6",
}
HDR_V35 = {"Authorization": f"Basic {B64}", "Content-Type": "application/json"}

router = APIRouter(prefix="/report", tags=["livechat-report"])

# ------------------------ YARDIMCI ------------------------
def _day_ist(d: str) -> tuple[str, str]:
    """Europe/Istanbul sabit offset (UTC+03:00)"""
    d = d[:10]
    return f"{d}T00:00:00+03:00", f"{d}T23:59:59+03:00"

def _day_ist_bounds(d: str) -> tuple[str, str]:
    return _day_ist(d)

def _iso_to_epoch_s(ts: str | None) -> float | None:
    if not ts or not isinstance(ts, str):
        return None
    t = ts.replace("Z", "+00:00")
    try:
        from datetime import datetime
        return datetime.fromisoformat(t).timestamp()
    except Exception:
        return None

# ------------------------ v3.6 ÖZET RAPOR ------------------------
async def _agent_art(c: httpx.AsyncClient, fr: str, to: str, email: str) -> float | None:
    body = {
        "filters": {"from": fr, "to": to, "agents": {"values": [email]}},
        "timezone": "Europe/Istanbul",
    }
    r = await c.post(f"{LC}/reports/chats/response_time", headers=HDR, json=body, timeout=60)
    if r.status_code != 200:
        return None
    j = r.json() or {}
    recs = j.get("records") or {}
    if isinstance(recs, dict):
        for _, v in recs.items():
            rt = (v or {}).get("response_time")
            if isinstance(rt, (int, float)):
                return rt
    return None

@router.get("/daily")
async def daily_summary(date: str = Query(..., description="YYYY-MM-DD (tek gün, Europe/Istanbul)")):
    fr, to = _day_ist(date)
    async with httpx.AsyncClient(timeout=60) as c:
        # 1️⃣ performans (ajan bazlı)
        pb = {"distribution": "day", "filters": {"from": fr, "to": to}, "timezone": "Europe/Istanbul"}
        r1 = await c.post(f"{LC}/reports/agents/performance", headers=HDR, json=pb)
        if r1.status_code != 200:
            raise HTTPException(r1.status_code, r1.text)
        perf = (r1.json() or {}).get("records") or {}
        if not isinstance(perf, dict):
            perf = {}

        # 2️⃣ rating (CSAT)
        rb = {"filters": {"from": fr, "to": to}, "timezone": "Europe/Istanbul"}
        r2 = await c.post(f"{LC}/reports/chats/ranking", headers=HDR, json=rb)
        if r2.status_code != 200:
            raise HTTPException(r2.status_code, r2.text)
        rank = (r2.json() or {}).get("records") or {}
        if not isinstance(rank, dict):
            rank = {}

        # 3️⃣ transfer-out (chat_transferred)
        transfer_out = {}
        for email in perf.keys():
            body = {
                "distribution": "day",
                "filters": {
                    "from": fr, "to": to,
                    "event_types": {"values": ["chat_transferred"]},
                    "agents": {"values": [email]},
                },
                "timezone": "Europe/Istanbul",
            }
            r4 = await c.post(f"{LC}/reports/chats/total_chats", headers=HDR, json=body)
            total = 0
            if r4.status_code == 200:
                j4 = r4.json() or {}
                if isinstance(j4.get("total"), (int, float)):
                    total = int(j4["total"])
                else:
                    recs = j4.get("records") or {}
                    if isinstance(recs, dict):
                        total = sum(int((v or {}).get("total") or 0) for v in recs.values())
            transfer_out[email] = total

        # 4️⃣ ajan bazlı ART
        art_map = {email: await _agent_art(c, fr, to, email) for email in perf.keys()}

    # 5️⃣ Çıktı
    rows = []
    for email, p in perf.items():
        if not isinstance(p, dict):
            continue
        chats = int(p.get("chats_count") or 0)
        fr_chats = int(p.get("first_response_chats_count") or 0)
        missed = max(chats - fr_chats, 0)
        frt = p.get("first_response_time")
        chat_sec = int(p.get("chatting_time") or 0)
        aht = (chat_sec / chats) if chats else None
        li = int(p.get("logged_in_time") or 0)
        ac = int(p.get("accepting_chats_time") or 0)
        nac = int(p.get("not_accepting_chats_time") or 0)
        rr = rank.get(email) or {}
        good, bad, tot = rr.get("good"), rr.get("bad"), rr.get("total")
        csat = None
        try:
            if isinstance(good, (int, float)) and isinstance(tot, (int, float)) and tot:
                csat = (float(good) / float(tot)) * 100.0
        except Exception:
            csat = None
        rows.append({
            "agent_email": email,
            "total_chats": chats,
            "first_response_time_sec": frt if isinstance(frt, (int, float)) else None,
            "avg_response_time_sec": art_map.get(email),
            "avg_handle_time_sec": aht if isinstance(aht, (int, float)) else None,
            "csat_good": good if isinstance(good, (int, float)) else None,
            "csat_bad": bad if isinstance(bad, (int, float)) else None,
            "csat_total": tot if isinstance(tot, (int, float)) else None,
            "csat_percent": round(csat, 2) if isinstance(csat, (int, float)) else None,
            "logged_in_hours": round(li / 3600, 2) if li else 0,
            "accepting_hours": round(ac / 3600, 2) if ac else 0,
            "not_accepting_hours": round(nac / 3600, 2) if nac else 0,
            "chatting_hours": round(chat_sec / 3600, 2) if chat_sec else 0,
            "transfer_out": transfer_out.get(email, 0),
            "missed_chats": missed,
        })
    return {"date": date[:10], "count": len(rows), "rows": rows}

# ------------------------ v3.5 MISSED CHAT DETAY ------------------------
async def _v35_list_chats_all(c: httpx.AsyncClient, fr: str, to: str, page_size=100, hard_cap=10000):
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
    r = await c.post(f"{LC_V35}/agent/action/list_threads", headers=HDR_V35, json={"chat_id": chat_id}, timeout=60)
    if r.status_code != 200:
        return []
    return r.json().get("threads") or []

def _chat_agents(chat: dict) -> set[str]:
    out = set()
    for u in (chat.get("users") or []):
        if u.get("type") == "agent":
            em = u.get("email") or u.get("id")
            if em and "@" in em:
                out.add(em)
    return out

def _missed_for_agent(threads: list[dict], agent_email: str) -> tuple[bool, float | None, str | None, str | None]:
    first_customer_ts = None
    ended_at = None
    agent_replied = False
    for th in threads:
        for ev in th.get("events", []):
            et = ev.get("type")
            aid = ev.get("author_id")
            created = ev.get("created_at")
            if et == "message" and aid and "@" not in aid:
                if first_customer_ts is None:
                    first_customer_ts = created
            if et in ("message", "file", "annotation", "system_message") and aid == agent_email:
                agent_replied = True
            if created:
                if not ended_at or _iso_to_epoch_s(created) > _iso_to_epoch_s(ended_at):
                    ended_at = created
    if agent_replied:
        return (False, None, None, None)
    if first_customer_ts and ended_at:
        dur = _iso_to_epoch_s(ended_at) - _iso_to_epoch_s(first_customer_ts)
        return (True, max(dur or 0, 0), first_customer_ts, ended_at)
    return (True, None, first_customer_ts, ended_at)

@router.get("/missed/details")
async def missed_details(
    date: str = Query(..., description="YYYY-MM-DD (Europe/Istanbul günü)"),
    agent: str = Query(..., description="Ajan e-postası (zorunlu)"),
    limit: int = Query(500, ge=1, le=500),
):
    if "@" not in agent:
        raise HTTPException(400, "agent must be a valid email")
    fr, to = _day_ist_bounds(date)
    async with httpx.AsyncClient(timeout=60) as c:
        chats = await _v35_list_chats_all(c, fr, to, page_size=100, hard_cap=5000)
        rows = []
        for ch in chats:
            cid = ch.get("id")
            if not cid:
                continue
            if agent not in _chat_agents(ch):
                continue
            ths = await _v35_list_threads(c, cid)
            is_missed, dur, started_at, ended_at = _missed_for_agent(ths, agent)
            if not is_missed:
                continue
            rows.append({
                "chat_id": cid,
                "agent_email": agent,
                "missed_duration_sec": int(dur) if dur is not None else None,
                "started_at": started_at,
                "ended_at": ended_at,
            })
            if len(rows) >= limit:
                break
    return {"date": date[:10], "agent": agent, "count": len(rows), "rows": rows}
