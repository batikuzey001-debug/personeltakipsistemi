# apps/api/app/api/routes_livechat_report.py
import os, httpx
from fastapi import APIRouter, HTTPException, Query

LC = "https://api.livechatinc.com/v3.6"
B64 = os.getenv("TEXT_BASE64_TOKEN", "")
if not B64:
    raise HTTPException(401, "TEXT_BASE64_TOKEN missing")

HDR = {
    "Authorization": f"Basic {B64}",
    "Content-Type": "application/json",
    "X-API-Version": "3.6",
}

router = APIRouter(prefix="/report", tags=["livechat-report"])

def _day(d: str) -> tuple[str, str]:
    d = d[:10]
    return f"{d}T00:00:00Z", f"{d}T23:59:59Z"

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
async def daily_summary(date: str = Query(..., description="YYYY-MM-DD (tek gün)")):
    fr, to = _day(date)
    async with httpx.AsyncClient(timeout=60) as c:
        # 1) Ajan performansı (missed = chats_count - first_response_chats_count)
        pb = {"distribution": "day", "filters": {"from": fr, "to": to}, "timezone": "Europe/Istanbul"}
        r1 = await c.post(f"{LC}/reports/agents/performance", headers=HDR, json=pb)
        if r1.status_code != 200:
            raise HTTPException(r1.status_code, r1.text)
        perf = (r1.json() or {}).get("records") or {}
        if not isinstance(perf, dict):
            perf = {}

        # 2) Rating (CSAT good/bad/total)
        rb = {"filters": {"from": fr, "to": to}, "timezone": "Europe/Istanbul"}
        r2 = await c.post(f"{LC}/reports/chats/ranking", headers=HDR, json=rb)
        if r2.status_code != 200:
            raise HTTPException(r2.status_code, r2.text)
        rank = (r2.json() or {}).get("records") or {}
        if not isinstance(rank, dict):
            rank = {}

        # 3) Transfer-out (event_types=chat_transferred), toplamı güvenli oku
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

        # 4) Ajan bazlı ART
        art_map = {email: await _agent_art(c, fr, to, email) for email in perf.keys()}

    # 5) Birleşik çıktı
    rows = []
    for email, p in perf.items():
        if not isinstance(p, dict):
            continue
        chats = int(p.get("chats_count") or 0)
        fr_chats = int(p.get("first_response_chats_count") or 0) if p.get("first_response_chats_count") is not None else int(p.get("first_response_count") or 0)
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
            "auto_transfer": None,   # İstenirse eklenir; şu an güvenilir değil
        })

    return {"date": date[:10], "count": len(rows), "rows": rows}
