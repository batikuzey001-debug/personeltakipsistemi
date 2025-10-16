# apps/api/app/api/routes_livechat_report.py

def _iso_bounds(day: str) -> tuple[str, str]:
    d = day[:10]
    return f"{d}T00:00:00Z", f"{d}T23:59:59Z"

async def _chat_count(c, dfrom: str, dto: str, agent_id: str) -> int:
    f0, t0 = _iso_bounds(dfrom)
    f1, t1 = _iso_bounds(dto)
    payload = {
        "filters": {"date_from": f0, "date_to": t1, "agents": [agent_id]},
        "pagination": {"page": 1, "limit": 1}
    }
    r = await c.post(f"{LC}/agent/action/list_chats", headers=HDR_JSON, json=payload, timeout=60)
    if r.status_code != 200:
        return 0
    j = r.json()
    return j.get("total") or j.get("count") or len(j.get("chats") or j.get("items") or [])

@router.get("/agents/summary")
async def agents_summary(date_from: str = Query(...), date_to: str = Query(...)):
    dfrom, dto = _date(date_from), _date(date_to)
    rows = []
    async with httpx.AsyncClient() as c:
        ags = await _agents(c)
        for a in ags or []:
            aid = a.get("id")
            if not aid: continue
            total = await _chat_count(c, dfrom, dto, aid)
            rows.append({ "agent_id": aid, "name": a.get("name"), "role": a.get("role"),
                          "total_chats": total,
                          "first_response_time_sec": None, "avg_response_time_sec": None,
                          "avg_handle_time_sec": None, "csat_avg": None })
    return {"range": {"from": dfrom, "to": dto}, "rows": rows, "count": len(rows)}

@router.get("/agent/{agent_id}")
async def agent_detail(agent_id: str, date_from: str = Query(...), date_to: str = Query(...), limit: int = 50):
    f0, _ = _iso_bounds(date_from)
    _, t1 = _iso_bounds(date_to)
    payload = {"filters": {"date_from": f0, "date_to": t1, "agents": [agent_id]},
               "pagination": {"page": 1, "limit": limit}}
    async with httpx.AsyncClient() as c:
        r = await c.post(f"{LC}/agent/action/list_chats", headers=HDR_JSON, json=payload, timeout=60)
        if r.status_code != 200:
            raise HTTPException(r.status_code, r.text)
        cj = r.json()
        chats = cj.get("chats") or cj.get("items") or []
    return {
        "range": {"from": date_from[:10], "to": date_to[:10]},
        "agent_id": agent_id,
        "kpi": { "total_chats": cj.get("total") or cj.get("count") or len(chats),
                 "first_response_time_sec": None, "avg_response_time_sec": None,
                 "avg_handle_time_sec": None, "csat_avg": None, "csat_count": None },
        "last_chats": [{ "id": c.get("id"), "started_at": c.get("started_at"),
                         "ended_at": c.get("ended_at"),
                         "tags": (c.get("properties") or {}).get("tags"),
                         "group_id": (c.get("properties") or {}).get("group_id") } for c in chats]
    }
