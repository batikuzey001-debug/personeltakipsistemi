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
        # 1) Ajan performansı
        pb = {"distribution": "day", "filters": {"from": fr, "to": to}}
        r1 = await c.post(f"{LC}/reports/agents/performance", headers=HDR, json=pb)
        r1.raise_for_status()
        perf = r1.json().get("records", {})  # {email:{...}}

        # 2) Rating
        rb = {"filters": {"from": fr, "to": to}}
        r2 = await c.post(f"{LC}/reports/chats/ranking", headers=HDR, json=rb)
        r2.raise_for_status()
        rank = r2.json().get("records", {})

        # 3) Transfer-out (ajan bazlı)
        transfer_out = {}
        for email in perf.keys():
            q = {
                "filters.from": fr,
                "filters.to": to,
                "filters.event_types.values": "chat_transferred",
                "filters.agents.values": email,
                "distribution": "day",
            }
            r4 = await c.get(f"{LC}/reports/chats/total_chats", headers=HDR, params=q)
            if r4.status_code == 200:
                recs = r4.json().get("records") or {}
                transfer_out[email] = int((recs.get(date[:10]) or {}).get("total") or 0)
            else:
                transfer_out[email] = 0

        # 4) Ajan bazlı ART
        art_map = {}
        for email in perf.keys():
            art_map[email] = await _agent_art(c, fr, to, email)

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
        })

    return {"date": date[:10], "count": len(rows), "rows": rows}

# --------- TEK ÇALIŞAN GÜNLÜK RAPORU (employee_id → livechat_email) ---------
from sqlalchemy import text as _sqltext
from app.db.session import engine as _eng

@router.get("/daily/employee/{employee_id}")
async def daily_employee(
    employee_id: str,
    date: str = Query(..., description="YYYY-MM-DD"),
):
    # 1) Çalışanın LiveChat e-postasını al
    with _eng.begin() as conn:
        row = conn.execute(
            _sqltext("SELECT livechat_email FROM employees WHERE employee_id=:eid"),
            {"eid": employee_id},
        ).first()
    email = (row and row[0]) or None
    if not email:
        raise HTTPException(404, f"livechat_email missing for employee_id={employee_id}")

    fr, to = _day(date)

    async with httpx.AsyncClient(timeout=60) as c:
        # performans (tek ajan)
        pb = {"distribution":"day","filters":{"from":fr,"to":to,"agents":{"values":[email]}}}
        r1 = await c.post(f"{LC}/reports/agents/performance", headers=HDR, json=pb); r1.raise_for_status()
        perf = r1.json().get("records", {}).get(email, {})

        # rating (tek ajan)
        rb = {"filters":{"from":fr,"to":to,"agents":{"values":[email]}}}
        r2 = await c.post(f"{LC}/reports/chats/ranking", headers=HDR, json=rb); r2.raise_for_status()
        rank = r2.json().get("records", {}).get(email, {})

        # ART (tek ajan)
        art = await _agent_art(c, fr, to, email)

        # transfer_out (tek ajan)
        tq = {
          "filters.from": fr, "filters.to": to,
          "filters.event_types.values": "chat_transferred",
          "filters.agents.values": email, "distribution":"day",
        }
        r3 = await c.get(f"{LC}/reports/chats/total_chats", headers=HDR, params=tq)
        tr_out = 0
        if r3.status_code == 200:
            recs = r3.json().get("records") or {}
            tr_out = int((recs.get(date[:10]) or {}).get("total") or 0)

    chats = int(perf.get("chats_count") or 0)
    frt   = perf.get("first_response_time")
    chat_sec = int(perf.get("chatting_time") or 0)
    aht   = (chat_sec / chats) if chats else None
    li, ac, nac = int(perf.get("logged_in_time") or 0), int(perf.get("accepting_chats_time") or 0), int(perf.get("not_accepting_chats_time") or 0)
    good, bad, tot = rank.get("good"), rank.get("bad"), rank.get("total")
    csat = (good / tot * 100) if (isinstance(good,(int,float)) and isinstance(tot,(int,float)) and tot) else None

    return {
      "date": date[:10],
      "employee_id": employee_id,
      "agent_email": email,
      "kpi": {
        "total_chats": chats,
        "frt_sec": frt,
        "art_sec": art,
        "aht_sec": aht,
        "csat_percent": round(csat,2) if csat is not None else None,
        "csat_good": good, "csat_bad": bad, "csat_total": tot,
        "logged_in_hours": round(li/3600,2) if li else 0,
        "accepting_hours": round(ac/3600,2) if ac else 0,
        "not_accepting_hours": round(nac/3600,2) if nac else 0,
        "chatting_hours": round(chat_sec/3600,2) if chat_sec else 0,
        "transfer_out": tr_out,
      }
    }
