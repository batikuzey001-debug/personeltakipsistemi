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
    # tek gün isteniyor, doğrudan ilk kaydı al
    for _, v in recs.items():
        return v.get("response_time")
    return None

@router.get("/daily")
async def daily_summary(date: str = Query(..., description="YYYY-MM-DD (tek gün)")):
    fr, to = _day(date)
    async with httpx.AsyncClient(timeout=60) as c:
        # 1) performans (ajan bazlı)
        pb = {"distribution": "day", "filters": {"from": fr, "to": to}}
        r1 = await c.post(f"{LC}/reports/agents/performance", headers=HDR, json=pb)
        r1.raise_for_status()
        perf = r1.json().get("records", {})  # {email:{...}}

        # 2) rating
        rb = {"filters": {"from": fr, "to": to}}
        r2 = await c.post(f"{LC}/reports/chats/ranking", headers=HDR, json=rb)
        r2.raise_for_status()
        rank = r2.json().get("records", {})

        # 3) transfer-out, missed, auto-transfer (ajan bazlı) — TÜMÜ POST + doğru filtreler
        transfer_out, missed_chats, auto_transfer = {}, {}, {}
        for email in perf.keys():
            # a) toplam transfer_out
            q_transfer = {
                "distribution": "day",
                "filters": {
                    "from": fr, "to": to,
                    "event_types": {"values": ["chat_transferred"]},
                    "agents": {"values": [email]},
                }
            }
            r4 = await c.post(f"{LC}/reports/chats/total_chats", headers=HDR, json=q_transfer)
            recs4 = r4.json().get("records") or {} if r4.status_code == 200 else {}
            transfer_out[email] = int((recs4.get(date[:10]) or {}).get("total") or 0)

            # b) missed: ilk yanıt arandı ve yok; ajan filtresi agent_response altında
            q_missed = {
                "distribution": "day",
                "filters": {
                    "from": fr, "to": to,
                    "agent_response": {
                        "first": True,
                        "exists": False,
                        "agents": {"values": [email]}
                    }
                }
            }
            r5 = await c.post(f"{LC}/reports/chats/total_chats", headers=HDR, json=q_missed)
            recs5 = r5.json().get("records") or {} if r5.status_code == 200 else {}
            missed_chats[email] = int((recs5.get(date[:10]) or {}).get("total") or 0)

            # c) auto-transfer: transfer + ilk yanıt yok; ajan filtresi agent_response altında
            q_auto = {
                "distribution": "day",
                "filters": {
                    "from": fr, "to": to,
                    "event_types": {"values": ["chat_transferred"]},
                    "agent_response": {
                        "first": True,
                        "exists": False,
                        "agents": {"values": [email]}
                    }
                }
            }
            r6 = await c.post(f"{LC}/reports/chats/total_chats", headers=HDR, json=q_auto)
            recs6 = r6.json().get("records") or {} if r6.status_code == 200 else {}
            auto_transfer[email] = int((recs6.get(date[:10]) or {}).get("total") or 0)

        # 4) ajan bazlı ART
        art_map = {}
        for email in perf.keys():
            art_map[email] = await _agent_art(c, fr, to, email)

    # 5) birleşik çıktı
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
