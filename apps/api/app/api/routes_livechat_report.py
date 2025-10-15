import os, httpx, datetime as dt
from fastapi import APIRouter, HTTPException, Query

LC_V35 = os.getenv("TEXT_API_URL", "https://api.livechatinc.com/v3.5")
LC_V2  = "https://api.livechatinc.com/v2"
B64    = os.getenv("TEXT_BASE64_TOKEN", "")
HJSON  = {"Authorization": f"Basic {B64}", "Content-Type": "application/json"}
HGET   = {"Authorization": f"Basic {B64}"}

router = APIRouter(prefix="/report", tags=["livechat-report"])

def _date(s: str) -> str:
    # yyyy-mm-dd veya iso → yyyy-mm-dd
    return s[:10]

async def _v2_agents_report(c: httpx.AsyncClient, dfrom: str, dto: str):
    url = f"{LC_V2}/reports/agents?date_from={_date(dfrom)}&date_to={_date(dto)}"
    r = await c.get(url, headers=HGET, timeout=60)
    if r.status_code != 200: raise HTTPException(r.status_code, r.text)
    return r.json()

async def _v2_surveys(c: httpx.AsyncClient, dfrom: str, dto: str):
    url = f"{LC_V2}/reports/surveys?from={_date(dfrom)}&to={_date(dto)}"
    r = await c.get(url, headers=HGET, timeout=60)
    if r.status_code != 200: raise HTTPException(r.status_code, r.text)
    return r.json()

async def _v35_agents(c: httpx.AsyncClient):
    # liste: id, name, role, group
    url = f"{LC_V35}/configuration/action/list_agents"
    r = await c.post(url, headers=HJSON, json={}, timeout=30)
    if r.status_code != 200: raise HTTPException(r.status_code, r.text)
    # normalize: array<agent>
    return r.json()

@router.get("/agents/summary")
async def agents_summary(
    date_from: str = Query(..., description="ISO or YYYY-MM-DD"),
    date_to:   str = Query(..., description="ISO or YYYY-MM-DD"),
):
    if not B64: raise HTTPException(401, "TEXT_BASE64_TOKEN missing")
    async with httpx.AsyncClient() as c:
        agents = await _v35_agents(c)
        rep    = await _v2_agents_report(c, date_from, date_to)
        surv   = await _v2_surveys(c, date_from, date_to)

    # indeksle
    meta = {a.get("id"): {"name": a.get("name"), "role": a.get("role")} for a in agents}
    rows = []
    by_agent = rep.get("agents", rep.get("data", []))  # v2 format farkı güvenliği
    csat_map = {}
    for s in surv.get("items", surv.get("surveys", [])):
        aid = s.get("agent_id") or s.get("agent", {}).get("id")
        if not aid: continue
        e = csat_map.setdefault(aid, {"count":0, "sum":0})
        score = s.get("score") or s.get("rating")
        if isinstance(score, (int,float)):
            e["count"] += 1; e["sum"] += float(score)

    for r in by_agent:
        aid = r.get("id") or r.get("agent_id")
        m = meta.get(aid, {})
        cs = csat_map.get(aid, {"count":0,"sum":0})
        csat_avg = (cs["sum"]/cs["count"]) if cs["count"] else None
        rows.append({
            "agent_id": aid,
            "name": m.get("name"),
            "role": m.get("role"),
            "total_chats": r.get("chats_total") or r.get("chats") or 0,
            "first_response_time_sec": r.get("first_response_time_avg") or r.get("frt_avg"),
            "avg_response_time_sec":   r.get("response_time_avg") or r.get("art_avg"),
            "avg_handle_time_sec":     r.get("handle_time_avg") or r.get("aht_avg"),
            "csat_avg": csat_avg,
        })
    return {
        "range": {"from": _date(date_from), "to": _date(date_to)},
        "rows": rows,
        "count": len(rows),
    }

@router.get("/agent/{agent_id}")
async def agent_detail(
    agent_id: str,
    date_from: str = Query(...),
    date_to:   str = Query(...),
    limit: int = 50
):
    if not B64: raise HTTPException(401, "TEXT_BASE64_TOKEN missing")
    async with httpx.AsyncClient() as c:
        # agents report → tek ajan filtresi varsa kullan, yoksa client-side filtre
        rep = await _v2_agents_report(c, date_from, date_to)
        surv = await _v2_surveys(c, date_from, date_to)

        # son 50 chat meta (opsiyonel): v3.5 list_chats + filter by agent_id
        payload = {
            "filters":{"date_from":date_from, "date_to":date_to, "agents":[agent_id]},
            "pagination":{"page":1,"limit":limit}
        }
        r = await c.post(f"{LC_V35}/agent/action/list_chats", headers=HJSON, json=payload, timeout=60)
        if r.status_code != 200: raise HTTPException(r.status_code, r.text)
        chats = r.json().get("chats", r.json().get("items", []))

    # agregasyon
    agg = next((a for a in rep.get("agents", rep.get("data", []))
                if (a.get("id") or a.get("agent_id")) == agent_id), {})
    sv = [s for s in surv.get("items", surv.get("surveys", []))
          if (s.get("agent_id") or s.get("agent",{}).get("id")) == agent_id]
    csat_avg = (sum(float(s.get("score") or s.get("rating",0)) for s in sv)/len(sv)) if sv else None

    return {
        "range": {"from": _date(date_from), "to": _date(date_to)},
        "agent_id": agent_id,
        "kpi":{
            "total_chats": agg.get("chats_total") or agg.get("chats") or 0,
            "first_response_time_sec": agg.get("first_response_time_avg") or agg.get("frt_avg"),
            "avg_response_time_sec":   agg.get("response_time_avg") or agg.get("art_avg"),
            "avg_handle_time_sec":     agg.get("handle_time_avg") or agg.get("aht_avg"),
            "csat_avg": csat_avg,
            "csat_count": len(sv),
        },
        "last_chats":[
            {
                "id": c.get("id"),
                "started_at": c.get("started_at"),
                "ended_at": c.get("ended_at"),
                "tags": c.get("properties",{}).get("tags"),
                "group_id": c.get("properties",{}).get("group_id"),
            } for c in chats
        ]
    }
