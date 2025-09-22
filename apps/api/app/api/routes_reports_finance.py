# apps/api/app/api/routes_reports_finance.py
from __future__ import annotations

from datetime import datetime, timedelta
from typing import List, Optional, Literal, Dict, Any

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field, validator
from sqlalchemy import text
from sqlalchemy.orm import Session

# Neden: Proje genelindeki DB oturumu ve ayar mimarisine uymak için.
from app.db.session import get_db

router = APIRouter(prefix="/reports/finance", tags=["reports:finance"])

# Neden: Kaynak şema olası farklı adlar kullanabilir; tek yerden kontrol edelim.
THREAD_KEY_COL = "thread_key"          # Örn: root_message_id / origin_msg_id / thread_key
TS_COL = "ts"                           # Olay timestamp kolonu
TYPE_COL = "type"
CHANNEL_COL = "channel"
EMPLOYEE_ID_COL = "employee_id"

FIRST_REPLY_TYPES = ("reply_first",)    # Gerekirse genişletilebilir
CLOSE_TYPES = ("approve", "reply_close", "reject")

DEPT_NAME = "Finans"                    # Sadece Finans departmanını rapora dahil etmek için

# ------------------------------
# Output Schemas
# ------------------------------
class FinanceCloseRow(BaseModel):
    employee_id: str = Field(..., description="RD-xxx")
    employee_name: str
    count: int
    avg_first_response_sec: Optional[float] = None
    avg_resolution_sec: Optional[float] = None
    trend_pct: Optional[float] = None
    profile_url: Optional[str] = None

class FinanceCloseReport(BaseModel):
    range_from: datetime
    range_to: datetime
    total_records: int
    rows: List[FinanceCloseRow]

# ------------------------------
# Helpers
# ------------------------------
def _parse_date(val: Optional[str], default: datetime) -> datetime:
    try:
        return datetime.fromisoformat(val) if val else default
    except ValueError:
        raise HTTPException(status_code=422, detail=f"Invalid date: {val}")

def _order_sql(order: str) -> str:
    # Neden: Güvenli whitelist sıralama.
    allowed = {
        "cnt_desc": "cnt DESC, avg_resolution_sec ASC",
        "cnt_asc": "cnt ASC, avg_resolution_sec ASC",
        "first_asc": "avg_first_response_sec ASC NULLS LAST",
        "first_desc": "avg_first_response_sec DESC NULLS LAST",
        "res_asc": "avg_resolution_sec ASC NULLS LAST",
        "res_desc": "avg_resolution_sec DESC NULLS LAST",
        "name_asc": "employee_name ASC",
        "name_desc": "employee_name DESC",
    }
    return allowed.get(order, allowed["cnt_desc"])

# ------------------------------
# Core Query (channelized)
# ------------------------------
def _close_time_query_sql() -> str:
    """
    Neden: Bonus/Finans için tek SQL; channel parametresi ile çalışır.
    Şema varsayımları:
      - events(tablosu): channel, type, ts, thread_key, employee_id
      - employees(tablosu): employee_id (RD-xxx), full_name, department
    Eğer kolon adlarınız farklıysa, dosya başındaki sabitleri değiştirmeniz yeterli.
    """
    return f"""
    WITH
    origin AS (
      SELECT
        e.{EMPLOYEE_ID_COL} AS employee_id,
        e.{THREAD_KEY_COL}  AS thread_key,
        MIN(e.{TS_COL})     AS origin_ts
      FROM events e
      WHERE e.{CHANNEL_COL} = :channel
        AND e.{TYPE_COL} = 'origin'
      GROUP BY 1,2
    ),
    first_reply AS (
      SELECT
        e.{THREAD_KEY_COL} AS thread_key,
        MIN(e.{TS_COL})    AS first_ts
      FROM events e
      WHERE e.{CHANNEL_COL} = :channel
        AND e.{TYPE_COL} IN :first_types
      GROUP BY 1
    ),
    first_close AS (
      SELECT
        e.{THREAD_KEY_COL} AS thread_key,
        MIN(e.{TS_COL})    AS close_ts
      FROM events e
      WHERE e.{CHANNEL_COL} = :channel
        AND e.{TYPE_COL} IN :close_types
      GROUP BY 1
    ),
    joined AS (
      SELECT
        o.employee_id,
        o.thread_key,
        o.origin_ts,
        fr.first_ts,
        fc.close_ts
      FROM origin o
      LEFT JOIN first_reply fr ON fr.thread_key = o.thread_key
      LEFT JOIN first_close fc ON fc.thread_key = o.thread_key
    ),
    ranged AS (
      SELECT *
      FROM joined
      WHERE origin_ts >= :frm AND origin_ts < :to
    ),
    per_thread AS (
      SELECT
        r.employee_id,
        r.origin_ts,
        r.first_ts,
        r.close_ts,
        EXTRACT(EPOCH FROM (r.first_ts - r.origin_ts)) AS first_sec,
        EXTRACT(EPOCH FROM (r.close_ts - r.origin_ts)) AS close_sec
      FROM ranged r
      WHERE r.close_ts IS NOT NULL -- yalnızca kapanışı olanlar
    ),
    per_emp AS (
      SELECT
        p.employee_id,
        COUNT(*) AS cnt,
        AVG(p.first_sec) AS avg_first_response_sec,
        AVG(p.close_sec) AS avg_resolution_sec
      FROM per_thread p
      GROUP BY 1
    ),
    team_7d AS (
      SELECT
        AVG(EXTRACT(EPOCH FROM (fc.close_ts - o.origin_ts))) AS team_avg_close_sec_7d
      FROM origin o
      JOIN first_close fc ON fc.thread_key = o.thread_key
      WHERE o.origin_ts >= :to - INTERVAL '7 day' AND o.origin_ts < :to
    )
    SELECT
      emp.employee_id,
      emp.full_name AS employee_name,
      per_emp.cnt,
      per_emp.avg_first_response_sec,
      per_emp.avg_resolution_sec,
      CASE
        WHEN team.team_avg_close_sec_7d IS NULL OR per_emp.avg_resolution_sec IS NULL THEN NULL
        ELSE ROUND( (team.team_avg_close_sec_7d - per_emp.avg_resolution_sec) * 100.0 / team.team_avg_close_sec_7d, 2)
      END AS trend_pct
    FROM per_emp
    JOIN employees emp ON emp.employee_id = per_emp.employee_id
    LEFT JOIN team_7d team ON TRUE
    WHERE emp.department = :dept_name
    ORDER BY {{ORDER_CLAUSE}}
    LIMIT :limit
    ;
    """.replace("{ORDER_CLAUSE}", "{ORDER_CLAUSE}")  # placeholder
    # Not: ORDER_CLAUSE sonradan güvenli whitelist ile dolduruluyor.

# ------------------------------
# Endpoint
# ------------------------------
@router.get("/close-time", response_model=FinanceCloseReport)
def finance_close_time_report(
    frm: Optional[str] = Query(None, description="YYYY-MM-DD"),
    to: Optional[str] = Query(None, description="YYYY-MM-DD (exclusive)"),
    order: Literal[
        "cnt_desc", "cnt_asc",
        "first_asc", "first_desc",
        "res_asc", "res_desc",
        "name_asc", "name_desc",
    ] = "cnt_desc",
    limit: int = Query(200, ge=1, le=500),
    db: Session = Depends(get_db),
):
    """
    Finans kanalındaki kapanış bazlı performans raporu.
    """
    today = datetime.utcnow().date()
    _frm = _parse_date(frm, default=datetime.combine(today - timedelta(days=6), datetime.min.time()))
    _to  = _parse_date(to,  default=datetime.combine(today + timedelta(days=1), datetime.min.time()))

    sql = _close_time_query_sql().replace("{ORDER_CLAUSE}", _order_sql(order))

    params = {
        "channel": "finans",
        "first_types": FIRST_REPLY_TYPES,
        "close_types": CLOSE_TYPES,
        "frm": _frm,
        "to": _to,
        "dept_name": DEPT_NAME,
        "limit": limit,
    }

    try:
        rows = db.execute(text(sql), params).mappings().all()
    except Exception as exc:
        # Neden: En çok görülen uyumsuzluk thread_key kolon adı.
        raise HTTPException(
            status_code=500,
            detail=f"Finance close-time query failed. Check column names (THREAD_KEY_COL='{THREAD_KEY_COL}') and events schema. Error: {exc}"
        )

    out_rows: List[FinanceCloseRow] = []
    for r in rows:
        out_rows.append(
            FinanceCloseRow(
                employee_id=r["employee_id"],
                employee_name=r["employee_name"],
                count=int(r["cnt"]),
                avg_first_response_sec=float(r["avg_first_response_sec"]) if r["avg_first_response_sec"] is not None else None,
                avg_resolution_sec=float(r["avg_resolution_sec"]) if r["avg_resolution_sec"] is not None else None,
                trend_pct=float(r["trend_pct"]) if r["trend_pct"] is not None else None,
                profile_url=f"/employees/{r['employee_id']}",
            )
        )

    return FinanceCloseReport(
        range_from=_frm,
        range_to=_to,
        total_records=len(out_rows),
        rows=out_rows,
    )
