# apps/api/app/api/routes_livechat_report.py
import os, httpx
from fastapi import APIRouter, HTTPException, Query

REPORTS = "https://reports.livechat.com/v2"
B64 = os.getenv("TEXT_BASE64_TOKEN", "")
if not B64:
    raise HTTPException(401, "TEXT_BASE64_TOKEN missing")

HDR = {"Authorization": f"Basic {B64}", "Accept": "application/json"}

router = APIRouter(prefix="/report", tags=["livechat-report"])

def _d(s: str) -> str:
    return s[:10]

async def _agents_report(c: httpx.AsyncClient, day: str):
    # Günlük per-agent: from=to=aynı gün
    url = f"{REPORTS}/agents?from={day}&to={day}"
    r = await c.get(url, headers=HDR, timeout=60)
    if r.status_code != 200:
        raise HTTPException(r.status_code, f"agents report error: {r.text}")
    # Beklenen alanlar: id/email, chats_total, first_response_time_avg, response_time_avg, handle_time_avg
    return r.json().get("agents") or r.json().get("data") or []

async def _surveys(c: httpx.AsyncClient, day: str):
    url = f"{REPORTS}/surveys?from={day}&to={day}"
    r = await c.get(url, headers=HDR, timeout=60)
    if r.status_code != 200:
        # CSAT yoksa raporu kesmeyelim
        return []
    items = r.json().get("items") or r.json().get("surveys") or []
    # agent_email -> (sum, cnt)
    acc = {}
    for s in items:
        aid = s.get("agent_id") or (s.get("agent") or {}).get("id")
        score = s.get("score") or s.get("rating")
        if not aid or not isinstance(score, (int, float)):
            continue
        v = acc.setdefault(aid, [0.0, 0])
        v[0] += float(score); v[1] += 1
    return {k: (v[0] / v[1]) for k, v in acc.items() if v[1]}

@router.get("/daily")
async def daily_summary(date: str = Query(..., description="YYYY-MM-DD (gün sonu raporu)")):
    day = _d(date)
    async with httpx.AsyncClient() as c:
        agents = await _agents_report(c, day)
        csat_map = await _surveys(c, day)

    rows = []
    for a in agents:
        aid = a.get("id") or a.get("agent_id")  # e-posta kimliği
        rows.append({
            "agent_email": aid,
            "total_chats": a.get("chats_total") or a.get("chats") or 0,
            "frt_sec":     a.get("first_response_time_avg") or a.get("frt_avg"),
            "art_sec":     a.get("response_time_avg") or a.get("art_avg"),
            "aht_sec":     a.get("handle_time_avg") or a.get("aht_avg"),
            "csat_avg":    csat_map.get(aid)
        })

    return {"date": day, "count": len(rows), "rows": rows}
