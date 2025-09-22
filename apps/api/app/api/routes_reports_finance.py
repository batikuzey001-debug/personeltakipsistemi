# apps/api/app/api/routes_reports_finance.py
from __future__ import annotations

from datetime import datetime, timedelta, date
from typing import List, Optional, Literal, TypedDict

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.db.session import get_db

router = APIRouter(prefix="/reports/finance", tags=["reports:finance"])

# Tablo/kolon sabitleri (standart)
EVENTS_TABLE = "events"
EMPLOYEES_TABLE = "employees"

TS_COL = "ts"
TYPE_COL = "type"
EMPLOYEE_ID_COL = "employee_id"
EMPLOYEE_FULLNAME_COL = "full_name"
EMPLOYEE_DEPT_COL = "department"
THREAD_COL = "correlation_id"
CHANNEL_COL = "channel"

IST_TZ = "Europe/Istanbul"
FINANCE_CHANNEL = "finans"
DEPT_NAME = "Finans"

FIRST_REPLY_TYPES = ("reply_first",)
CLOSE_TYPES = ("approve", "reply_close", "reject")

# Panel (Bonus) ile birebir şema
class Trend(TypedDict):
    emoji: str
    pct: float | None
    team_avg_close_sec: float | None

class Row(TypedDict):
    employee_id: str
    full_name: str
    department: str
    count_total: int
    avg_first_sec: float | None
    avg_close_sec: float
    trend: Trend


def _parse_yyyy_mm_dd(s: Optional[str]) -> date | None:
    if not s:
        return None
    try:
        return datetime.fromisoformat(s).date()
    except Exception:
        raise HTTPException(status_code=422, detail=f"Invalid date: {s}")

def _order_sql(order: str) -> str:
    # Neden: Tablo okunabilirliği; önce süre sonra adet veya tersi
    mapping = {
        "avg_asc": "avg_close_sec ASC, count_total DESC",
        "avg_desc": "avg_close_sec DESC, count_total DESC",
        "cnt_desc": "count_total DESC, avg_close_sec ASC",
    }
    return mapping.get(order, mapping["avg_asc"])

def _sql_finance_by_close(order_clause: str) -> str:
    """
    Close'a göre süz; personeli ilk kapanıştan bağla; kanal=finans; dept=Finans.
    """
    return f"""
    WITH
    -- Finans origin'leri (zincir başlangıcı)
    origin_fin AS (
      SELECT
        e.{EMPLOYEE_ID_COL} AS origin_emp,   -- bilgilendirme amaçlı; personeli close'tan alacağız
        e.{THREAD_COL}      AS thread_key,
        MIN(e.{TS_COL})     AS origin_ts
      FROM {EVENTS_TABLE} e
      WHERE e.{CHANNEL_COL} = '{FINANCE_CHANNEL}'
        AND e.{TYPE_COL} = 'origin'
      GROUP BY 1,2
    ),

    -- Finans'ta ilk reply_first
    first_reply_fin AS (
      SELECT
        e.{THREAD_COL}  AS thread_key,
        MIN(e.{TS_COL}) AS first_ts
      FROM {EVENTS_TABLE} e
      WHERE e.{CHANNEL_COL} = '{FINANCE_CHANNEL}'
        AND e.{TYPE_COL} IN :first_types
      GROUP BY 1
    ),

    -- Finans'ta ilk kapanış (ilk ts + o kaydın employee_id'si)
    first_close_fin AS (
      SELECT DISTINCT ON (e.{THREAD_COL})
        e.{THREAD_COL}  AS thread_key,
        e.{EMPLOYEE_ID_COL} AS closer_emp,
        e.{TS_COL}      AS close_ts
      FROM {EVENTS_TABLE} e
      WHERE e.{CHANNEL_COL} = '{FINANCE_CHANNEL}'
        AND e.{TYPE_COL} IN :close_types
      ORDER BY e.{THREAD_COL}, e.{TS_COL}
    ),

    -- Origin + first_reply + first_close birleşimi
    joined AS (
      SELECT
        fc.thread_key,
        fc.closer_emp      AS employee_id,   -- kişi eşleştirme: kapanışı yapan
        o.origin_ts,
        fr.first_ts,
        fc.close_ts
      FROM first_close_fin fc
      LEFT JOIN origin_fin      o  ON o.thread_key  = fc.thread_key
      LEFT JOIN first_reply_fin fr ON fr.thread_key = fc.thread_key
    ),

    -- Aralık: KAPANIŞ tarihine göre (İstanbul TZ)
    ranged AS (
      SELECT *
      FROM joined
      WHERE (fc_close_ist := (close_ts AT TIME ZONE '{IST_TZ}')) IS NOT NULL
        AND fc_close_ist >= :frm::date
        AND fc_close_ist <  :to::date
    ),

    -- Süreler (ilk yanıt opsiyonel)
    per_thread AS (
      SELECT
        r.employee_id,
        EXTRACT(EPOCH FROM (r.first_ts  - r.origin_ts)) AS first_sec,
        EXTRACT(EPOCH FROM (r.close_ts  - r.origin_ts)) AS close_sec
      FROM ranged r
      WHERE r.close_ts IS NOT NULL
    ),

    per_emp AS (
      SELECT
        p.employee_id,
        COUNT(*)         AS count_total,
        AVG(p.first_sec) AS avg_first_sec,
        AVG(p.close_sec) AS avg_close_sec
      FROM per_thread p
      GROUP BY 1
    ),

    -- Finans ekibinin 7g ortalaması (adil kıyas: kanal=finans + dept=Finans)
    team_7d AS (
      WITH fin_origin AS (
        SELECT
          e.{THREAD_COL} AS thread_key,
          MIN(e.{TS_COL}) AS origin_ts
        FROM {EVENTS_TABLE} e
        WHERE e.{CHANNEL_COL} = '{FINANCE_CHANNEL}' AND e.{TYPE_COL} = 'origin'
        GROUP BY 1
      ),
      fin_first_close AS (
        SELECT DISTINCT ON (e.{THREAD_COL})
          e.{THREAD_COL} AS thread_key,
          e.{TS_COL}     AS close_ts
        FROM {EVENTS_TABLE} e
        WHERE e.{CHANNEL_COL} = '{FINANCE_CHANNEL}' AND e.{TYPE_COL} IN :close_types
        ORDER BY e.{THREAD_COL}, e.{TS_COL}
      ),
      threads AS (
        SELECT
          o.thread_key,
          o.origin_ts,
          fc.close_ts
        FROM fin_origin o
        JOIN fin_first_close fc ON fc.thread_key = o.thread_key
        WHERE (fc.close_ts AT TIME ZONE '{IST_TZ}') >= (:to::date - INTERVAL '7 day')
          AND (fc.close_ts AT TIME ZONE '{IST_TZ}') <   :to::date
      )
      SELECT AVG(EXTRACT(EPOCH FROM (t.close_ts - t.origin_ts))) AS team_avg_close_sec
      FROM threads t
    )

    SELECT
      emp.{EMPLOYEE_ID_COL}       AS employee_id,
      emp.{EMPLOYEE_FULLNAME_COL} AS full_name,
      emp.{EMPLOYEE_DEPT_COL}     AS department,
      per_emp.count_total,
      per_emp.avg_first_sec,
      per_emp.avg_close_sec,
      team.team_avg_close_sec
    FROM per_emp
    JOIN {EMPLOYEES_TABLE} emp ON emp.{EMPLOYEE_ID_COL} = per_emp.employee_id
    LEFT JOIN team_7d team ON TRUE
    WHERE emp.{EMPLOYEE_DEPT_COL} = :dept_name
    ORDER BY {order_clause}
    LIMIT :limit
    ;
    """

def _to_float(x: object) -> float | None:
    if x is None:
        return None
    try:
        return float(x)
    except Exception:
        return None

def _trend_emoji(pct: Optional[float]) -> str:
    if pct is None:
        return "•"
    return "🟢" if pct >= 0 else "🔴"


@router.get("/close-time", response_model=list[Row])
def finance_close_time(
    frm: Optional[str] = Query(None, description="YYYY-MM-DD (IST)"),
    to: Optional[str] = Query(None, description="YYYY-MM-DD (IST, exclusive)"),
    order: Literal["avg_asc", "avg_desc", "cnt_desc"] = "avg_asc",
    limit: int = Query(200, ge=1, le=500),
    db: Session = Depends(get_db),
):
    """
    Finans kapanış performansı — Close'a göre süzülür, kişi 'ilk kapanış'tan alınır.
    Panel Bonus şemasıyla birebir Row[] döner.
    """
    today_ist = datetime.utcnow().date()  # ist'e kaydırmıyoruz, SQL tarafında TZ ile süzüyoruz
    frm_d = _parse_yyyy_mm_dd(frm) or (today_ist - timedelta(days=6))
    to_d  = _parse_yyyy_mm_dd(to)  or (today_ist + timedelta(days=1))

    sql = _sql_finance_by_close(order_clause=_order_sql(order))
    params = {
        "first_types": FIRST_REPLY_TYPES,
        "close_types": CLOSE_TYPES,
        "frm": frm_d.isoformat(),
        "to": to_d.isoformat(),
        "dept_name": DEPT_NAME,
        "limit": limit,
    }

    try:
        rows = db.execute(text(sql), params).mappings().all()
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Finance close-time query failed. Error: {exc}")

    out: List[Row] = []
    team_avg = _to_float(rows[0]["team_avg_close_sec"]) if rows else None

    for r in rows:
        avg_close = _to_float(r["avg_close_sec"])
        avg_first = _to_float(r["avg_first_sec"])
        if team_avg is not None and team_avg > 0 and avg_close is not None:
            pct = round((team_avg - avg_close) * 100.0 / team_avg, 2)
        else:
            pct = None

        out.append(
            Row(
                employee_id=r["employee_id"],
                full_name=r["full_name"],
                department=r["department"],
                count_total=int(r["count_total"]),
                avg_first_sec=avg_first,
                avg_close_sec=avg_close or 0.0,
                trend=Trend(emoji=_trend_emoji(pct), pct=pct, team_avg_close_sec=team_avg),
            )
        )

    return out
