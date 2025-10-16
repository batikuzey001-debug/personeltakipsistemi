# apps/api/app/api/routes_livechat_report.py
import os, httpx
from fastapi import APIRouter, HTTPException, Query

LC = os.getenv("TEXT_API_URL", "https://api.livechatinc.com/v3.5")
B64 = os.getenv("TEXT_BASE64_TOKEN", "")
if not B64:
    raise HTTPException(401, "TEXT_BASE64_TOKEN missing")
HDR_JSON = {"Authorization": f"Basic {B64}", "Content-Type": "application/json"}

router = APIRouter(prefix="/report", tags=["livechat-report"])

def _date(s: str) -> str:
    return s[:10]

async def _agents(c: httpx.AsyncClient):
    r = await c.post(f"{LC}/configuration/action/list_agents", headers=HDR_JSON, json={}, timeout=30)
    if r.status_code != 200: raise HTTPException(r.status_code, r.text)
    j = r.json()
    return (j.get("items") or j.get("agents") or j) if isinstance(j, dict) else j

async def _chat_count(c: httpx.AsyncClient, dfrom: str, dto: str, agent_id: str) -> int:
    payload = {"filters": {"date_from": dfrom, "date_to": dto, "agents": [agent_id]},
               "pagination": {"page": 1, "limit": 1}}
    r = await c.post(f"{LC}/agent/action/list_chats", headers=HDR_JSON, json=payload, timeout=60)
    if r.status_code != 200: return 0
    j = r.json()
    return j.get("total") or j.get("count") or len(j.get("chats") or j.get("items") or [])

@router.get("/agents/summary")
async def agents_summary(
    date_from: str = Query(..., description="YYYY-MM-DD or ISO"),
    date_to:   str = Query(..., description="YYYY-MM-DD or ISO"),
):
    dfrom, dto = _date(date_from), _date(date_to)
    rows = []
    async with httpx.AsyncClient() as c:
        ags = await _agents(c)
        for a in ags or []:
            aid = a.get("id")
            if not aid: continue
            total = await _chat_count(c, dfrom, dto, aid)
            rows.append({
                "agent_id": aid,
                "name": a.get("name"),
                "role": a.get("role"),
                "total_chats": total,
                "first_response_time_sec": None,
                "avg_response_time_sec":   None,
                "avg_handle_time_sec":     None,
                "csat_avg":                None,
            })
    return {"range": {"from": dfrom, "to": dto}, "rows": rows, "count": len(rows)}

@router.get("/agent/{agent_id}")
async def agent_detail(
    agent_id: str,
    date_from: str = Query(...),
    date_to:   str = Query(...),
    limit: int = 50
):
    # Basit MVP: Son sohbetlerin sadece meta bilgisi
    dfrom, dto = _date(date_from), _date(date_to)
    payload = {"filters": {"date_from": dfrom, "date_to": dto, "agents": [agent_id]},
               "pagination": {"page": 1, "limit": limit}}
    async with httpx.AsyncClient() as c:
        r = await c.post(f"{LC}/agent/action/list_chats", headers=HDR_JSON, json=payload, timeout=60)
        if r.status_code != 200: raise HTTPException(r.status_code, r.text)
        cj = r.json()
        chats = cj.get("chats") or cj.get("items") or []
    return {
        "range": {"from": dfrom, "to": dto},
        "agent_id": agent_id,
        "kpi": {
            "total_chats": cj.get("total") or cj.get("count") or len(chats),
            "first_response_time_sec": None,
            "avg_response_time_sec":   None,
            "avg_handle_time_sec":     None,
            "csat_avg": None,
            "csat_count": None,
        },
        "last_chats": [
            {
                "id": c.get("id"),
                "started_at": c.get("started_at"),
                "ended_at": c.get("ended_at"),
                "tags": (c.get("properties") or {}).get("tags"),
                "group_id": (c.get("properties") or {}).get("group_id"),
            } for c in chats
        ]
    }
