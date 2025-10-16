# apps/api/app/api/routes_livechat_report.py
import os, httpx
from fastapi import APIRouter, HTTPException, Query

LC = "https://api.livechatinc.com/v3.6"
B64 = os.getenv("TEXT_BASE64_TOKEN", "")
if not B64:
    raise HTTPException(401, "TEXT_BASE64_TOKEN missing")

HDR = {"Authorization": f"Basic {B64}", "Content-Type": "application/json"}

router = APIRouter(prefix="/report", tags=["livechat-report"])

def _day(d: str) -> tuple[str, str]:
    d = d[:10]
    return f"{d}T00:00:00Z", f"{d}T23:59:59Z"

@router.get("/daily")
async def daily_summary(
    date: str = Query(..., description="YYYY-MM-DD (tek gün)"),
):
    f, t = _day(date)
    async with httpx.AsyncClient(timeout=60) as c:
        # 1) Kişi bazlı performans (günlük dağıtım)
        perf_body = {"distribution": "day", "filters": {"from": f, "to": t}}
        r1 = await c.post(f"{LC}/reports/agents/performance", headers=HDR, json=perf_body)
        if r1.status_code != 200:
            raise HTTPException(r1.status_code, f"agents/performance: {r1.text}")
        perf = r1.json().get("records", {})  # { "agent@email": {...} }

        # 2) Kişi bazlı rating sayıları (aynı gün)
        rank_body = {"filters": {"from": f, "to": t}}
        r2 = await c.post(f"{LC}/reports/chats/ranking", headers=HDR, json=rank_body)
        if r2.status_code != 200:
            raise HTTPException(r2.status_code, f"chats/ranking: {r2.text}")
        rank = r2.json().get("records", {})  # { email: {total, good, bad, score} }

    rows = []
    for email, p in perf.items():
        chats = int(p.get("chats_count", 0) or 0)
        frt = p.get("first_response_time")            # sn
        chat_sec = p.get("chatting_time")             # toplam chat süresi (sn)
        aht = (chat_sec / chats) if chats else None   # ort. handle time ≈ chatting_time / chats
        r = rank.get(email, {})
        good, bad, tot = r.get("good"), r.get("bad"), r.get("total")
        csat = (good / tot * 100) if (isinstance(good, (int,float)) and isinstance(tot, (int,float)) and tot) else None

        rows.append({
            "agent_email": email,
            "total_chats": chats,
            "first_response_time_sec": frt,
            "avg_response_time_sec": None,     # v3.6 per-agent yok; gerekirse ek uçla tahminleriz
            "avg_handle_time_sec": aht,
            "csat_good": good,
            "csat_bad": bad,
            "csat_total": tot,
            "csat_percent": round(csat, 2) if csat is not None else None,
        })

    return {"date": date[:10], "count": len(rows), "rows": rows}
