# apps/api/app/services/bonus_summary_service.py
from __future__ import annotations
from datetime import datetime, date, timedelta
from typing import Optional
from sqlalchemy.orm import Session
from sqlalchemy import text, bindparam
from pytz import timezone
import requests

from app.core.admin_tasks_config import ADMIN_TASKS_TG_TOKEN, ADMIN_TASKS_TG_CHAT_ID
from app.services.admin_settings_service import get_bool, BONUS_TG_ENABLED_KEY

IST = timezone("Europe/Istanbul")
UTC = timezone("UTC")

SLA_FIRST_SEC_DEFAULT = 60  # İlk KT SLA eşiği
CLOSE_TYPES = ("approve", "reply_close", "reject")

def _ist_day_edges_utc(d: date):
    start_ist = IST.localize(datetime(d.year, d.month, d.day, 0, 0, 0))
    end_ist   = IST.localize(datetime(d.year, d.month, d.day, 23, 59, 59))
    return start_ist.astimezone(UTC), end_ist.astimezone(UTC)

def _tg_send(text_msg: str) -> bool:
    if not ADMIN_TASKS_TG_TOKEN or not ADMIN_TASKS_TG_CHAT_ID:
        return False
    try:
        requests.post(
            f"https://api.telegram.org/bot{ADMIN_TASKS_TG_TOKEN}/sendMessage",
            json={"chat_id": int(ADMIN_TASKS_TG_CHAT_ID), "text": text_msg},
            timeout=5,
        )
        return True
    except Exception:
        return False

def _already_sent(db: Session, period_key: str) -> bool:
    q = text("""
        SELECT 1 FROM admin_notifications_log
        WHERE channel='bonus' AND type='daily' AND period_key=:pk
        LIMIT 1
    """)
    return db.execute(q, {"pk": period_key}).first() is not None

def _mark_sent(db: Session, period_key: str) -> None:
    db.execute(
        text("""
            INSERT INTO admin_notifications_log (channel,type,period_key)
            VALUES ('bonus','daily',:pk)
            ON CONFLICT (channel,type,period_key) DO NOTHING
        """),
        {"pk": period_key},
    )
    db.commit()

def _mmss(seconds: Optional[float]) -> str:
    if seconds is None:
        return "—"
    s = int(round(max(0.0, seconds)))
    return f"{s//60:02d}:{s%60:02d}"

# ---------------- Gün Sonu (dün) ----------------
def _sql_bonus_daily():
    return """
    WITH
    origin AS (
      SELECT e.correlation_id AS corr, MIN(e.ts) AS origin_ts
      FROM events e
      WHERE e.source_channel='bonus' AND e.type='origin'
      GROUP BY 1
    ),
    fr AS (
      SELECT e.correlation_id AS corr, MIN(e.ts) AS first_ts
      FROM events e
      WHERE e.source_channel='bonus' AND e.type='reply_first'
      GROUP BY 1
    ),
    fc AS (
      SELECT DISTINCT ON (e.correlation_id)
             e.correlation_id AS corr,
             e.employee_id    AS closer_emp,
             e.ts             AS close_ts
      FROM events e
      WHERE e.source_channel='bonus' AND e.type IN :close_types
      ORDER BY e.correlation_id, e.ts
    ),
    day_fr AS (
      SELECT fr.corr, fr.first_ts, o.origin_ts
      FROM fr
      JOIN origin o ON o.corr=fr.corr
      WHERE fr.first_ts >= :frm AND fr.first_ts <= :to
    ),
    day_fr_secs AS (
      SELECT EXTRACT(EPOCH FROM (first_ts - origin_ts)) AS first_sec
      FROM day_fr
      WHERE first_ts IS NOT NULL AND origin_ts IS NOT NULL
    ),
    day_fc AS (
      SELECT fc.corr, fc.closer_emp, fc.close_ts
      FROM fc
      WHERE fc.close_ts >= :frm AND fc.close_ts <= :to
    ),
    close_emp AS (
      SELECT closer_emp, COUNT(*) AS close_cnt
      FROM day_fc
      GROUP BY closer_emp
    ),
    fr_on_fc AS (
      SELECT dfc.closer_emp,
             EXTRACT(EPOCH FROM (dfr.first_ts - dfr.origin_ts)) AS first_sec
      FROM day_fc dfc
      JOIN day_fr dfr ON dfr.corr = dfc.corr
      WHERE dfr.first_ts IS NOT NULL AND dfr.origin_ts IS NOT NULL
    ),
    close_emp_with_kt AS (
      SELECT c.closer_emp,
             c.close_cnt,
             AVG(f.first_sec) AS avg_first_emp
      FROM close_emp c
      LEFT JOIN fr_on_fc f ON f.closer_emp = c.closer_emp
      GROUP BY c.closer_emp, c.close_cnt
    )
    SELECT
      (SELECT COUNT(*) FROM day_fc) AS total_close,
      (SELECT AVG(first_sec) FROM day_fr_secs) AS avg_first_sec,
      (SELECT COUNT(*) FROM day_fr_secs WHERE first_sec > :sla_first) AS sla_first_cnt,
      (
        SELECT json_agg(x ORDER BY x.cnt DESC, x.avg_first_emp ASC)
        FROM (
          SELECT closer_emp AS employee_id, close_cnt AS cnt, avg_first_emp
          FROM close_emp_with_kt
          ORDER BY close_cnt DESC, avg_first_emp ASC
          LIMIT 3
        ) AS x
      ) AS top3
    ;
    """

def build_bonus_daily_text(rows, target_day: date, sla_first_sec: int) -> str:
    total = int(rows["total_close"] or 0)
    avg_first_sec = rows["avg_first_sec"]
    sla_first_cnt = int(rows["sla_first_cnt"] or 0)
    top3 = rows["top3"] or []

    date_str = target_day.strftime("%d.%m.%Y")
    lines = [
        f"📣 BONUS GÜN SONU — {date_str}",
        f"• Toplam Kapanış: {total}",
        f"• Ø İlk Yanıt: {int(round(avg_first_sec)) if avg_first_sec is not None else '—'} sn",
        f"• SLA>{sla_first_sec} sn (İlk Yanıt): {sla_first_cnt}",
        "",
        "İlk 3:",
    ]
    if top3:
        for t in top3:
            emp = t.get("employee_id") or "-"
            cnt = int(t.get("cnt") or 0)
            avg_emp = t.get("avg_first_emp")
            lines.append(f"• {emp} — {cnt} işlem, Ø İlk Yanıt {int(round(avg_emp)) if avg_emp is not None else '—'} sn")
    else:
        lines.append("• —")
    return "\n".join(lines)

def send_bonus_daily_summary(db: Session, target_day: date, sla_first_sec: int = SLA_FIRST_SEC_DEFAULT) -> bool:
    if not get_bool(db, BONUS_TG_ENABLED_KEY, False):
        return False
    period_key = target_day.strftime("%Y-%m-%d")
    if _already_sent(db, period_key):
        return False

    frm_utc, to_utc = _ist_day_edges_utc(target_day)
    stmt = text(_sql_bonus_daily()).bindparams(bindparam("close_types", expanding=True))
    rows = db.execute(
        stmt,
        {"frm": frm_utc, "to": to_utc, "close_types": list(CLOSE_TYPES), "sla_first": sla_first_sec},
    ).mappings().first()
    msg = build_bonus_daily_text(rows, target_day, sla_first_sec)
    sent = _tg_send(msg)
    if sent:
        _mark_sent(db, period_key)
    return sent

# ---------------- 2 Saatlik (hafif) ----------------
def _ist_window_utc(end_ist: datetime, hours: int = 2):
    end_ist = end_ist.astimezone(IST)
    start_ist = end_ist - timedelta(hours=hours)
    frm_utc = start_ist.astimezone(UTC)
    to_utc = end_ist.astimezone(UTC)
    return frm_utc, to_utc, start_ist.strftime("%H:%M"), end_ist.strftime("%H:%M")

def _already_sent_periodic(db: Session, period_key: str) -> bool:
    q = text("""
        SELECT 1 FROM admin_notifications_log
        WHERE channel='bonus' AND type='periodic_2h' AND period_key=:pk
        LIMIT 1
    """)
    return db.execute(q, {"pk": period_key}).first() is not None

def _mark_sent_periodic(db: Session, period_key: str) -> None:
    db.execute(
        text("""
            INSERT INTO admin_notifications_log (channel,type,period_key)
            VALUES ('bonus','periodic_2h',:pk)
            ON CONFLICT (channel,type,period_key) DO NOTHING
        """),
        {"pk": period_key},
    )
    db.commit()

def _sql_bonus_periodic():
    return """
    WITH
    origin AS (
      SELECT e.correlation_id AS corr, MIN(e.ts) AS origin_ts
      FROM events e
      WHERE e.source_channel='bonus' AND e.type='origin'
      GROUP BY 1
    ),
    fr AS (
      SELECT e.correlation_id AS corr, MIN(e.ts) AS first_ts
      FROM events e
      WHERE e.source_channel='bonus' AND e.type='reply_first'
      GROUP BY 1
    ),
    fc AS (
      SELECT DISTINCT ON (e.correlation_id)
             e.correlation_id AS corr,
             e.employee_id    AS closer_emp,
             e.ts             AS close_ts
      FROM events e
      WHERE e.source_channel='bonus' AND e.type IN :close_types
      ORDER BY e.correlation_id, e.ts
    ),
    win_fr AS (
      SELECT fr.corr, fr.first_ts, o.origin_ts
      FROM fr
      JOIN origin o ON o.corr=fr.corr
      WHERE fr.first_ts >= :frm AND fr.first_ts <= :to
    ),
    win_fr_secs AS (
      SELECT EXTRACT(EPOCH FROM (first_ts - origin_ts)) AS first_sec
      FROM win_fr
      WHERE first_ts IS NOT NULL AND origin_ts IS NOT NULL
    ),
    win_fc AS (
      SELECT fc.corr, fc.closer_emp, fc.close_ts
      FROM fc
      WHERE fc.close_ts >= :frm AND fc.close_ts <= :to
    ),
    close_emp AS (
      SELECT closer_emp, COUNT(*) AS close_cnt
      FROM win_fc
      GROUP BY closer_emp
    ),
    fr_on_fc AS (
      SELECT wf.corr, wfc.closer_emp,
             EXTRACT(EPOCH FROM (wf.first_ts - wf.origin_ts)) AS first_sec
      FROM win_fr wf
      JOIN win_fc wfc ON wfc.corr = wf.corr
      WHERE wf.first_ts IS NOT NULL AND wf.origin_ts IS NOT NULL
    ),
    close_emp_with_kt AS (
      SELECT c.closer_emp,
             c.close_cnt,
             AVG(f.first_sec) AS avg_first_emp
      FROM close_emp c
      LEFT JOIN fr_on_fc f ON f.closer_emp = c.closer_emp
      GROUP BY c.closer_emp, c.close_cnt
    )
    SELECT
      (SELECT COUNT(*) FROM win_fc) AS total_close,
      (SELECT AVG(first_sec) FROM win_fr_secs) AS avg_first_sec,
      (SELECT COUNT(*) FROM win_fr_secs WHERE first_sec > :sla_first) AS sla_first_cnt,
      (SELECT COUNT(*) FROM win_fr_secs) AS first_cnt,
      (
        SELECT json_agg(x ORDER BY x.cnt DESC, x.avg_first_emp ASC)
        FROM (
          SELECT closer_emp AS employee_id, close_cnt AS cnt, avg_first_emp
          FROM close_emp_with_kt
          ORDER BY close_cnt DESC, avg_first_emp ASC
          LIMIT 2
        ) AS x
      ) AS top2
    ;
    """

def build_bonus_periodic_text(rows, date_label: str, win_start: str, win_end: str, sla_first_sec: int, sla_warn_pct: int) -> str:
    total = int(rows["total_close"] or 0)
    avg_first_sec = rows["avg_first_sec"]
    sla_cnt = int(rows["sla_first_cnt"] or 0)
    first_cnt = int(rows["first_cnt"] or 0)
    sla_rate = int(round((sla_cnt / first_cnt) * 100)) if first_cnt > 0 else 0
    top2 = rows["top2"] or []

    lines = [
        f"⏱️ BONUS • {date_label} {win_start}-{win_end}",
        "",
        f"• Kapanış: {total}",
        f"• Ø İlk KT: {int(round(avg_first_sec)) if avg_first_sec is not None else '—'} sn",
        f"• SLA>{sla_first_sec} sn: {sla_cnt} (%{sla_rate})",
        "",
    ]

    if total > 0 and top2:
        lines.append("İyi Gidenler")
        for t in top2:
            emp = t.get("employee_id") or "-"
            cnt = int(t.get("cnt") or 0)
            avg_emp = t.get("avg_first_emp")
            lines.append(f"• {emp} — {cnt} işlem, Ø {int(round(avg_emp)) if avg_emp is not None else '—'} sn")

    if sla_rate >= sla_warn_pct:
        lines.append("")
        lines.append(f"⚠️ SLA> {sla_first_sec} sn yüksek (%{sla_rate})")

    return "\n".join(lines)

def send_bonus_periodic_2h(
    db: Session,
    window_end_ist: Optional[datetime] = None,
    sla_first_sec: int = SLA_FIRST_SEC_DEFAULT,
    sla_warn_pct: int = 25,
) -> bool:
    if not get_bool(db, BONUS_TG_ENABLED_KEY, False):
        return False

    end_ist = (window_end_ist or datetime.now(IST)).astimezone(IST)
    frm_utc, to_utc, win_start, win_end = _ist_window_utc(end_ist, hours=2)
    date_label = end_ist.strftime("%d.%m.%Y")
    period_key = end_ist.strftime("%Y-%m-%dT%H:00")
    if _already_sent_periodic(db, period_key):
        return False

    stmt = text(_sql_bonus_periodic()).bindparams(bindparam("close_types", expanding=True))
    rows = db.execute(
        stmt,
        {"frm": frm_utc, "to": to_utc, "close_types": list(CLOSE_TYPES), "sla_first": sla_first_sec},
    ).mappings().first()

    msg = build_bonus_periodic_text(rows, date_label, win_start, win_end, sla_first_sec, sla_warn_pct)
    sent = _tg_send(msg)
    if sent:
        _mark_sent_periodic(db, period_key)
    return sent
