from __future__ import annotations

from datetime import datetime, timedelta, date
from typing import List, Optional, Literal, TypedDict

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.db.session import get_db

router = APIRouter(prefix="/reports/finance", tags=["reports:finance"])

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

FIRST_REPLY_TYPES = ("reply_first",)
CLOSE_TYPES = ("approve", "reply_close", "reject")

# Panel ile uyumlu tipler
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


def _parse_date(val: Optional[str], default: date) -> date:
    if not val:
        return default
    try:
        return datetime.fromisoformat(val).date()
    except Exception:
        raise HTTPException(status_code=422, detail=f"Invalid date: {val}")


def _order_sql(order: str) -> str:
    mapping = {
        "avg_asc": "avg_close_sec ASC, count_total DESC",
        "avg_desc": "avg_close_sec DESC, count_total DESC",
        "cnt_desc": "count_total DESC, avg_close_sec ASC",
    }
    return mapping.get(order, mapping["avg_asc"])


def _sql_finance_by_close(order_clause: str) -> str:
    """
    Close'a göre süz; personeli ilk kapanıştan bağla; kanal=finans.
    Departman filtresi YOK -> tüm departmanlar görünür.
    """
    return f"""
    WITH
    origin AS (
      SELECT
        e.{THREAD_COL}      AS thread_key,
        MIN(e.{TS_COL})     AS origin_ts
      FROM {EVENTS_TABLE} e
      WHERE e.{CHANNEL_COL} = '{FINANCE_CHANNEL}'
        AND e.{TYPE_COL} = 'origin'
      GROUP BY 1
    ),
    first_reply AS (
      SELECT
        e.{THREAD_COL}  AS thread_key,
        MIN(e.{TS_COL}) AS first_ts
      FROM {EVENTS_TABLE} e
      WHERE e.{CHANNEL_COL} = '{FINANCE_CHANNEL}'
        AND e.{TYPE_COL} IN :first_types
      GROUP BY 1
    ),
    first_close AS (
      SELECT DISTINCT ON (e.{THREAD_COL})
        e.{THREAD_COL}      AS thread_key,
        e.{EMPLOYEE_ID_COL} AS closer_emp,
        e.{TS_COL}          AS close_ts
      FROM {EVENTS_TABLE} e
      WHERE e.{CHANNEL_COL} = '{FINANCE_CHANNEL}'
        AND e.{TYPE_COL} IN :close_types
      ORDER BY e.{THREAD_COL}, e.{TS_COL}
    ),
    joined AS (
      SELECT
        fc.thread_key,
        fc.closer_emp      AS employee_id,
        o.origin_ts,
        fr.first_ts,
        fc.close_ts
      FROM first_close fc
      LEFT JOIN origin     o  ON o.thread_key  = fc.thread_key
      LEFT JOIN first_reply fr ON fr.thread_key = fc.thread_key
    ),
    ranged AS (
      SELECT *
      FROM joined
      WHERE (close_ts AT TIME ZONE '{IST_TZ}') >= :frm::date
        AND (close_ts AT TIME ZONE '{IST_TZ}') <  :to::date
    ),
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
    team_7d AS (
      SELECT
        AVG(EXTRACT(EPOCH FROM (fc.close_ts - o.origin_ts))) AS team_avg_close_sec
      FROM origin o
      JOIN first_close fc ON fc.thread_key = o.thread_key
      WHERE (fc.close_ts AT TIME ZONE '{IST_TZ}') >= (:to::date - INTERVAL '7 day')
        AND (fc.close_ts AT TIME ZONE '{IST_TZ}') <   :to::date
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
    limit: int = Query(100, ge=1, le=100),
    db: Session = Depends(get_db),
):
    """
    Finans kapanış performansı — Close'a göre süzülür, kişi 'ilk kapanış'tan alınır.
    Departman filtresi kaldırıldı.
    """
    today = datetime.utcnow().date()
    frm_d = _parse_date(frm, default=today - timedelta(days=6))
    to_d  = _parse_date(to,  default=today + timedelta(days=1))

    sql = _sql_finance_by_close(order_clause=_order_sql(order))
    params = {
        "first_types": FIRST_REPLY_TYPES,
        "close_types": CLOSE_TYPES,
        "frm": frm_d.isoformat(),
        "to": to_d.isoformat(),
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
        if team_avg and avg_close:
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
                trend=Trend(
                    emoji=_trend_emoji(pct),
                    pct=pct,
                    team_avg_close_sec=team_avg,
                ),
            )
        )

    return out
