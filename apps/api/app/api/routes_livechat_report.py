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
    q = {"filters.from": fr, "filters.to": to, "filters.agents.values": email}
    r = await c.get(f"{LC}/reports/chats/response_time", headers=HDR, params=q, timeout=60)
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
        # 1️⃣ performans (ajan bazlı)
        pb = {"distribution": "day", "filters": {"from": fr, "to": to}}
        r1 = await c.post(f"{LC}/reports/agents/performance", headers=HDR, json=pb)
        r1.raise_for_status()
        perf = r1.json().get("records", {})

        # 2️⃣ rating
        rb = {"filters": {"from": fr, "to": to}}
        r2 = await c.post(f"{LC}/reports/chats/ranking", headers=HDR, json=rb)
        r2.raise_for_status()
        rank = r2.json().get("records", {})

        # 3️⃣ transfer-out (manuel veya otomatik)
        transfer_out = {}
        auto_transfer = {}
        missed_chats = {}
        for email in perf.keys():
            # a) toplam transferler
            q1 = {
                "filters.from": fr,
                "filters.to": to,
                "filters.event_types.values": "chat_transferred",
                "filters.agents.values": email,
                "distribution": "day",
            }
            r4 = await c.get(f"{LC}/reports/chats/total_chats", headers=HDR, params=q1)
            recs = r4.json().get("records") or {} if r4.status_code == 200 else {}
            transfer_out[email] = int((recs.get(date[:10]) or {}).get("total") or 0)

            # b) missed chats (ajan hiç yanıt vermedi)
            q2 = {
                "distribution": "day",
                "filters.from": fr,
                "filters.to": to,
                "filters.agents.values": email,
                "filters.agent_response.first": "true",
                "filters.agent_response.exists": "false",
            }
            r5 = await c.get(f"{LC}/reports/chats/total_chats", headers=HDR, params=q2)
            recs2 = r5.json().get("records") or {} if r5.status_code == 200 else {}
            missed_chats[email] = int((recs2.get(date[:10]) or {}).get("total") or 0)

            # c) auto-transfer (yanıt verilmeden transfer)
            q3 = {
                "distribution": "day",
                "filters.from": fr,
                "filters.to": to,
                "filters.event_types.values": "chat_transferred",
                "filters.agents.values": email,
                "filters.agent_response.first": "true",
                "filters.agent_response.exists": "false",
            }
            r6 = await c.get(f"{LC}/reports/chats/total_chats", headers=HDR, params=q3)
            recs3 = r6.json().get("records") or {} if r6.status_code == 200 else {}
            auto_transfer[email] = int((recs3.get(date[:10]) or {}).get("total") or 0)

        # 4️⃣ ajan bazlı ART
        art_map = {}
        for email in perf.keys():
            art_map[email] = await _agent_art(c, fr, to, email)

    # 5️⃣ birleşik çıktı
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
            "csat_good": good,
            "csat_bad": bad,
            "csat_total": tot,
            "csat_percent": round(csat, 2) if csat is not None else None,
            "logged_in_hours": round(li / 3600, 2) if li else 0,
            "accepting_hours": round(ac / 3600, 2) if ac else 0,
            "not_accepting_hours": round(nac / 3600, 2) if nac else 0,
            "chatting_hours": round(chat_sec / 3600, 2) if chat_sec else 0,
            "transfer_out": transfer_out.get(email, 0),
            "missed_chats": missed_chats.get(email, 0),
            "auto_transfer": auto_transfer.get(email, 0),
        })

    return {"date": date[:10], "count": len(rows), "rows": rows}
