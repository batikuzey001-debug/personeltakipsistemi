# apps/api/app/api/routes_livechat_report.py
import os, httpx
from fastapi import APIRouter, HTTPException, Query

LC = "https://api.livechatinc.com/v3.6"
B64 = os.getenv("TEXT_BASE64_TOKEN", "")
if not B64:
    raise HTTPException(401, "TEXT_BASE64_TOKEN missing")

HDR = {"Authorization": f"Basic {B64}", "Content-Type": "application/json", "X-API-Version": "3.6"}

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
        # 1) Ajan performansı (chats_count, frt, süreler)
        perf_body = {"distribution": "day", "filters": {"from": f, "to": t}}
        r1 = await c.post(f"{LC}/reports/agents/performance", headers=HDR, json=perf_body)
        if r1.status_code != 200:
            raise HTTPException(r1.status_code, f"agents/performance -> {r1.text}")
        perf = r1.json().get("records", {})  # {email:{...}}

        # 2) Rating sayıları (good/bad/total)
        rank_body = {"filters": {"from": f, "to": t}}
        r2 = await c.post(f"{LC}/reports/chats/ranking", headers=HDR, json=rank_body)
        if r2.status_code != 200:
            raise HTTPException(r2.status_code, f"chats/ranking -> {r2.text}")
        rank = r2.json().get("records", {})  # {email:{total,good,bad,score}}

        # 3) Ortalama yanıt (ART) — genel seviye (opsiyonel)
        # İstersen agent bazlı event hesaplaması ekleriz; şimdilik gün genelini ekleyelim.
        art_body = {"filters": {"from": f, "to": t}}
        r3 = await c.post(f"{LC}/reports/chats/response_time", headers=HDR, json=art_body)
        art_day = None
        if r3.status_code == 200:
            rec = (r3.json().get("records") or {}).get(date[:10]) or {}
            art_day = rec.get("response_time")

    rows = []
    for email, p in perf.items():
        chats = int(p.get("chats_count") or 0)
        frt   = p.get("first_response_time")            # sn
        chat  = p.get("chatting_time")                  # sn (toplam)
        aht   = (chat / chats) if chats else None       # ≈ ort. işlem süresi
        rr    = rank.get(email, {})
        good, bad, tot = rr.get("good"), rr.get("bad"), rr.get("total")
        csat = (good / tot * 100) if (isinstance(good,(int,float)) and isinstance(tot,(int,float)) and tot) else None

        rows.append({
            "agent_email": email,
            "total_chats": chats,
            "first_response_time_sec": frt,
            "avg_response_time_sec": art_day,   # gün genel ART; kişi bazlı istenirse sonraki sprintte
            "avg_handle_time_sec": aht,
            "csat_good": good,
            "csat_bad": bad,
            "csat_total": tot,
            "csat_percent": round(csat, 2) if csat is not None else None,
        })

    return {"date": date[:10], "count": len(rows), "rows": rows}
