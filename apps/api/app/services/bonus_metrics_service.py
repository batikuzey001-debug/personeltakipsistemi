# apps/api/app/services/bonus_metrics_service.py
from __future__ import annotations
from datetime import datetime, date, timedelta
from typing import Optional, Dict, Any
from sqlalchemy.orm import Session
from sqlalchemy import text, bindparam
from pytz import timezone

IST = timezone("Europe/Istanbul")
UTC = timezone("UTC")

CLOSE_TYPES = ("approve", "reply_close", "reject")


def _ist_day_edges_utc(d: date):
    start_ist = IST.localize(datetime(d.year, d.month, d.day, 0, 0, 0))
    end_ist = IST.localize(datetime(d.year, d.month, d.day, 23, 59, 59))
    return start_ist.astimezone(UTC), end_ist.astimezone(UTC)


def _ist_window_utc(end_ist: datetime, hours: int = 2):
    end_ist = end_ist.astimezone(IST)
    start_ist = end_ist - timedelta(hours=hours)
    frm_utc = start_ist.astimezone(UTC)
    to_utc = end_ist.astimezone(UTC)
    return frm_utc, to_utc, start_ist.strftime("%H:%M"), end_ist.strftime("%H:%M")


# ---------- Gün sonu (dün) context ----------
def compute_bonus_daily_context(
    db: Session, target_day: date, sla_first_sec: int = 60
) -> Dict[str, Any]:
    """
    Dünkü (IST) bonus performansını döner:
    {
      "date_label": "27.09.2025",
      "total_close": 454,
      "avg_first_sec": 18,
      "gt60_total": 22,
      "slow_list": [{"full_name":"Ece","gt60_cnt":7}, ...],
      "per_emp": [{"full_name":"Ece","close_cnt":126,"avg_first_emp":21}, ...]
    }
    """
    frm_utc, to_utc = _ist_day_edges_utc(target_day)

    sql = """
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
    day_fc AS (
      SELECT fc.corr, fc.closer_emp, fc.close_ts
      FROM fc
      WHERE fc.close_ts >= :frm AND fc.close_ts <= :to
    ),
    day_fr_secs AS (
      SELECT EXTRACT(EPOCH FROM (first_ts - origin_ts)) AS first_sec
      FROM day_fr
      WHERE first_ts IS NOT NULL AND origin_ts IS NOT NULL
    ),
    close_emp AS (
      SELECT closer_emp, COUNT(*) AS close_cnt
      FROM day_fc GROUP BY closer_emp
    ),
    fr_on_fc AS (
      SELECT dfc.closer_emp,
             EXTRACT(EPOCH FROM (dfr.first_ts - dfr.origin_ts)) AS first_sec
      FROM day_fc dfc
      JOIN day_fr dfr ON dfr.corr = dfc.corr
      WHERE dfr.first_ts IS NOT NULL AND dfr.origin_ts IS NOT NULL
    ),
    close_emp_with_kt AS (
      SELECT c.closer_emp, c.close_cnt, AVG(f.first_sec) AS avg_first_emp
      FROM close_emp c LEFT JOIN fr_on_fc f ON f.closer_emp = c.closer_emp
      GROUP BY c.closer_emp, c.close_cnt
    ),
    slow_by_emp AS (
      SELECT closer_emp, COUNT(*) AS gt60_cnt
      FROM fr_on_fc WHERE first_sec > :sla_first
      GROUP BY closer_emp
    )
    SELECT
      (SELECT COUNT(*) FROM day_fc) AS total_close,
      (SELECT AVG(first_sec) FROM day_fr_secs) AS avg_first_sec,
      (SELECT COUNT(*) FROM day_fr_secs WHERE first_sec > :sla_first) AS gt60_total,
      (
        SELECT json_agg(x ORDER BY x.gt60_cnt DESC, x.full_name ASC)
        FROM (
          SELECT em.full_name, s.gt60_cnt
          FROM slow_by_emp s JOIN employees em ON em.employee_id = s.closer_emp
          WHERE s.gt60_cnt > 0
        ) x
      ) AS slow_list,
      (
        SELECT json_agg(x ORDER BY x.close_cnt DESC, x.avg_first_emp ASC NULLS LAST, x.full_name ASC)
        FROM (
          SELECT em.full_name, c.close_cnt, ck.avg_first_emp
          FROM close_emp c
          JOIN employees em ON em.employee_id = c.closer_emp
          LEFT JOIN close_emp_with_kt ck ON ck.closer_emp = c.closer_emp
        ) x
      ) AS per_emp
    ;
    """
    stmt = text(sql).bindparams(bindparam("close_types", expanding=True))
    row = (
        db.execute(
            stmt,
            {"frm": frm_utc, "to": to_utc, "close_types": list(CLOSE_TYPES), "sla_first": sla_first_sec},
        )
        .mappings()
        .first()
        or {}
    )

    return {
        "date_label": target_day.strftime("%d.%m.%Y"),
        "total_close": int(row.get("total_close") or 0),
        "avg_first_sec": (None if row.get("avg_first_sec") is None else int(round(row["avg_first_sec"]))),
        "gt60_total": int(row.get("gt60_total") or 0),
        "slow_list": row.get("slow_list") or [],
        "per_emp": row.get("per_emp") or [],
    }


# ---------- 2 saatlik context (sade) ----------
def compute_bonus_periodic_context(
    db: Session,
    window_end_ist: Optional[datetime] = None,
    hours: int = 2,
    kt30_sec: int = 30,  # İstenen eşik: 30 sn üzeri İlk KT
) -> Dict[str, Any]:
    """
    Son 2 saatlik bonus özeti (IST):

    Dönen context örneği:
    {
      "date_label": "27.09.2025",
      "win_start": "12:00",
      "win_end": "14:00",
      "total_close": 98,
      "per_emp": [{"full_name":"Ahmet","close_cnt":34}, ...],
      "slow_30": [{"full_name":"Ahmet","gt30_cnt":5}, ...]
    }
    """
    end_ist = (window_end_ist or datetime.now(IST)).astimezone(IST)
    frm_utc, to_utc, win_start, win_end = _ist_window_utc(end_ist, hours=hours)

    sql = """
    WITH
    origin AS (
      SELECT e.correlation_id AS corr, MIN(e.ts) AS origin_ts
      FROM events e WHERE e.source_channel='bonus' AND e.type='origin'
      GROUP BY 1
    ),
    fr AS (
      SELECT e.correlation_id AS corr, MIN(e.ts) AS first_ts
      FROM events e WHERE e.source_channel='bonus' AND e.type='reply_first'
      GROUP BY 1
    ),
    fc AS (
      SELECT DISTINCT ON (e.correlation_id)
             e.correlation_id AS corr, e.employee_id AS closer_emp, e.ts AS close_ts
      FROM events e
      WHERE e.source_channel='bonus' AND e.type IN :close_types
      ORDER BY e.correlation_id, e.ts
    ),
    win_fr AS (
      SELECT fr.corr, fr.first_ts, o.origin_ts
      FROM fr JOIN origin o ON o.corr=fr.corr
      WHERE fr.first_ts >= :frm AND fr.first_ts <= :to
    ),
    win_fr_secs AS (
      SELECT EXTRACT(EPOCH FROM (first_ts - origin_ts)) AS first_sec
      FROM win_fr WHERE first_ts IS NOT NULL AND origin_ts IS NOT NULL
    ),
    win_fc AS (
      SELECT fc.corr, fc.closer_emp, fc.close_ts
      FROM fc WHERE fc.close_ts >= :frm AND fc.close_ts <= :to
    ),
    close_emp AS (
      SELECT closer_emp, COUNT(*) AS close_cnt
      FROM win_fc GROUP BY closer_emp
    ),
    fr_on_fc AS (
      SELECT wf.corr, wfc.closer_emp, EXTRACT(EPOCH FROM (wf.first_ts - wf.origin_ts)) AS first_sec
      FROM win_fr wf JOIN win_fc wfc ON wfc.corr = wf.corr
      WHERE wf.first_ts IS NOT NULL AND wf.origin_ts IS NOT NULL
    )
    SELECT
      (SELECT COUNT(*) FROM win_fc) AS total_close,
      (
        SELECT json_agg(x ORDER BY x.close_cnt DESC, x.full_name ASC)
        FROM (
          SELECT em.full_name, ce.close_cnt
          FROM close_emp ce
          JOIN employees em ON em.employee_id = ce.closer_emp
        ) AS x
      ) AS per_emp,
      (
        SELECT json_agg(x ORDER BY x.gt30_cnt DESC, x.full_name ASC)
        FROM (
          SELECT em.full_name, COUNT(*) AS gt30_cnt
          FROM fr_on_fc f
          JOIN employees em ON em.employee_id = f.closer_emp
          WHERE f.first_sec > :kt30
          GROUP BY em.full_name
          HAVING COUNT(*) > 0
        ) AS x
      ) AS slow_30
    ;
    """
    stmt = text(sql).bindparams(bindparam("close_types", expanding=True))
    row = (
        db.execute(
            stmt, {"frm": frm_utc, "to": to_utc, "close_types": list(CLOSE_TYPES), "kt30": kt30_sec}
        )
        .mappings()
        .first()
        or {}
    )

    return {
        "date_label": end_ist.strftime("%d.%m.%Y"),
        "win_start": win_start,
        "win_end": win_end,
        "total_close": int(row.get("total_close") or 0),
        "per_emp": row.get("per_emp") or [],
        "slow_30": row.get("slow_30") or [],
    }
