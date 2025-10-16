# apps/api/app/jobs/livechat_reports_job.py
import os, httpx
from datetime import datetime, timezone, timedelta
from sqlalchemy import text
from app.db.session import engine

LC = "https://api.livechatinc.com/v3.6"
B64 = os.getenv("TEXT_BASE64_TOKEN","")
HDR = {"Authorization": f"Basic {B64}", "Content-Type":"application/json", "X-API-Version":"3.6"}

def _bounds(d: datetime):
    day = d.date().isoformat()
    return f"{day}T00:00:00Z", f"{day}T23:59:59Z", day

async def ingest_livechat_daily(day_dt: datetime | None = None):
    d = (day_dt or datetime.now(timezone.utc))
    frm, to, day = _bounds(d)

    async with httpx.AsyncClient(timeout=60) as c:
        # 1) agents/performance → chats_count, frt, süreler
        perf_body = {"distribution":"day","filters":{"from":frm,"to":to}}
        r1 = await c.post(f"{LC}/reports/agents/performance", headers=HDR, json=perf_body)
        r1.raise_for_status()
        perf = r1.json().get("records", {})   # {email:{...}}

        # 2) chats/ranking → good/bad/total (CSAT%)
        rank_body = {"filters":{"from":frm,"to":to}}
        r2 = await c.post(f"{LC}/reports/chats/ranking", headers=HDR, json=rank_body)
        r2.raise_for_status()
        rank = r2.json().get("records", {})   # {email:{total,good,bad,...}}

        # 3) chats/total_chats (transfer_out) — event filtresi
        trf_body = {
          "filters":{
            "from": frm, "to": to,
            "event_types":{"values":["chat_transferred"]}
          }
        }
        r3 = await c.post(f"{LC}/reports/chats/total_chats", headers=HDR, json=trf_body)
        r3.raise_for_status()
        # transfer_out toplu döner; ajan kırılımı yoksa 0 geç
        transfer_out = {}  # {email:int}  (gerekirse ajan bazlı ek çağrılarla doldurulur)

    # UPSERT
    sql = """
    INSERT INTO livechat_agent_metrics_day
      (day, agent_email, chats_count, frt_sec, art_sec, aht_sec,
       csat_good, csat_bad, csat_total, csat_percent,
       logged_in_sec, accepting_sec, not_accepting_sec, chatting_sec,
       online_hours, transfer_out, supervised_chats, internal_msg_count,
       created_at, updated_at)
    VALUES
      (:day, :agent_email, :chats_count, :frt_sec, :art_sec, :aht_sec,
       :csat_good, :csat_bad, :csat_total, :csat_percent,
       :logged_in_sec, :accepting_sec, :not_accepting_sec, :chatting_sec,
       :online_hours, :transfer_out, :supervised_chats, :internal_msg_count,
       now(), now())
    ON CONFLICT (day, agent_email) DO UPDATE SET
      chats_count=EXCLUDED.chats_count,
      frt_sec=EXCLUDED.frt_sec,
      art_sec=EXCLUDED.art_sec,
      aht_sec=EXCLUDED.aht_sec,
      csat_good=EXCLUDED.csat_good,
      csat_bad=EXCLUDED.csat_bad,
      csat_total=EXCLUDED.csat_total,
      csat_percent=EXCLUDED.csat_percent,
      logged_in_sec=EXCLUDED.logged_in_sec,
      accepting_sec=EXCLUDED.accepting_sec,
      not_accepting_sec=EXCLUDED.not_accepting_sec,
      chatting_sec=EXCLUDED.chatting_sec,
      online_hours=EXCLUDED.online_hours,
      transfer_out=EXCLUDED.transfer_out,
      updated_at=now();
    """

    rows = []
    for email, p in perf.items():
        chats = int(p.get("chats_count") or 0)
        frt   = p.get("first_response_time")
        chat  = int(p.get("chatting_time") or 0)
        aht   = (chat / chats) if chats else None
        li    = int(p.get("logged_in_time") or 0)
        ac    = int(p.get("accepting_chats_time") or 0)
        nac   = int(p.get("not_accepting_chats_time") or 0)
        # online_hours opsiyonel: li/3600 veya availability raporundan
        rh    = rank.get(email, {})
        good, bad, tot = rh.get("good"), rh.get("bad"), rh.get("total")
        csat = (good / tot * 100) if (isinstance(good,(int,float)) and isinstance(tot,(int,float)) and tot) else None

        rows.append({
          "day": day, "agent_email": email,
          "chats_count": chats, "frt_sec": frt, "art_sec": None, "aht_sec": aht,
          "csat_good": good, "csat_bad": bad, "csat_total": tot, "csat_percent": csat,
          "logged_in_sec": li, "accepting_sec": ac, "not_accepting_sec": nac, "chatting_sec": chat,
          "online_hours": li/3600 if li else None,
          "transfer_out": transfer_out.get(email, 0),
          "supervised_chats": None, "internal_msg_count": None
        })

    with engine.begin() as conn:
        for r in rows:
            conn.execute(text(sql), r)
