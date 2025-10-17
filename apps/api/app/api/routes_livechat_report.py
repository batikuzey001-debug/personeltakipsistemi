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
    body = {"filters": {"from": fr, "to": to, "agents": {"values": [email]}}}
    r = await c.post(f"{LC}/reports/chats/response_time", headers=HDR, json=body, timeout=60)
    if r.status_code != 200:
        return None
    recs = r.json().get("records") or {}
    for _, v in recs.items():
        return v.get("response_time")
    return None

@router.get("/daily")
async def daily_summary(date: str = Query(..., description="YYYY-MM-DD (tek gün)")):
    fr, to = _day(date)
    async with httpx.AsyncClient(timeout=60) as c:
        # 1) performans (kişiye özel metrikler + first_response_chats_count içerir)
        pb = {"distribution": "day", "filters": {"from": fr, "to": to}, "timezone": "Europe/Istanbul"}
        r1 = await c.post(f"{LC}/reports/agents/performance", headers=HDR, json=pb)
        r1.raise_for_status()
        perf = r1.json().get("records", {})  # {email: {chats_count, first_response_chats_count, ...}}

        # 2) rating
        rb = {"filters": {"from": fr, "to": to}, "timezone": "Europe/Istanbul"}
        r2 = await c.post(f"{LC}/reports/chats/ranking", headers=HDR, json=rb)
        r2.raise_for_status()
        rank = r2.json().get("records", {})

        # 3) transfer-out (toplam)
        transfer_out = {}
        for email in perf.keys():
            q_transfer = {
                "filters": {
                    "from": fr, "to": to,
                    "event_types": {"values": ["chat_transferred"]},
                    "agents": {"values": [email]},
                },
                "distribution": "day",
                "timezone": "Europe/Istanbul",
            }
            r4 = await c.post(f"{LC}/reports/chats/total_chats", headers=HDR, json=q_transfer)
            if r4.status_code == 200:
                j4 = r4.json()
                total = j4.get("total")
                if total is None:
                    recs = j4.get("records") or {}
                    total = sum(int((v or {}).get("total") or 0) for v in recs.values())
                transfer_out[email] = int(total or 0)
            else:
                transfer_out[email] = 0

        # 4) ajan bazlı ART
        art_map = {email: await _agent_art(c, fr, to, email) for email in perf.keys()}

    # 5) birleşik çıktı
    rows = []
    for email, p in perf.items():
        chats = int(p.get("chats_count") or 0)
        fr_chats = int(p.get("first_response_chats_count") or 0)  # ⬅️ var olan alan
        missed = max(chats - fr_chats, 0)                          # ⬅️ doğru missed hesabı

        frt = p.get("first_response_time")
        chat_sec = int(p.get("chatting_time") or 0)
        aht = (chat_sec / chats) if chats else None
        li = int(p.get("logged_in_time") or 0)
        ac = int(p.get("accepting_chats_time") or 0)
        nac = int(p.get("not_accepting_chats_time") or 0)

        rr = rank.get(email, {})
        good, bad, tot = rr.get("good"), rr.get("bad"), rr.get("total")
        csat = (good / tot * 100) if (isinstance(good,(int,float)) and isinstance(tot,(int,float)) and tot) else None

        rows.append({
            "agent_email": email,
            "total_chats": chats,
            "first_response_time_sec": frt,
            "avg_response_time_sec": art_map.get(email),
            "avg_handle_time_sec": aht,
            "csat_good": good, "csat_bad": bad, "csat_total": tot,
            "csat_percent": round(csat, 2) if csat is not None else None,
            "logged_in_hours": round(li/3600, 2) if li else 0,
            "accepting_hours": round(ac/3600, 2) if ac else 0,
            "not_accepting_hours": round(nac/3600, 2) if nac else 0,
            "chatting_hours": round(chat_sec/3600, 2) if chat_sec else 0,
            "transfer_out": transfer_out.get(email, 0),
            "missed_chats": missed,                 # ✅ artık perf’ten
            "auto_transfer": None,                  # istersen koru ya da transfer_out ile ayrıştır
        })

    return {"date": date[:10], "count": len(rows), "rows": rows}
