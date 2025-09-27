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

SLA_FIRST_SEC_DEFAULT = 60  # İlk KT eşiği
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

# ---------------- Gün Sonu (dün) - Yeni Format ----------------
def _sql_bonus_daily():
    """
    Günlük BONUS özeti (IST):
      - Genel: toplam kapanış (first_close), Ø ilk yanıt (reply_first), 60 sn üzeri ilk yanıt sayısı
      - Geç Yanıt Verenler: kişi bazında (first_sec > :sla_first) sayıları
      - Personel Bazlı İşlem: tüm bonus personellerinin close_cnt + avg_first_emp
    """
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
    -- Günlük pencereler
    day_fr AS (
      SELECT fr.corr, fr.first_ts, o.origin_ts
      FROM fr
      JOIN origin o ON o.corr = fr.corr
      WHERE fr.first_ts >= :frm AND fr.first_ts <= :to
    ),
    day_fc AS (
      SELECT fc.corr, fc.closer_emp, fc.close_ts
      FROM fc
      WHERE fc.close_ts >= :frm AND fc.close_ts <= :to
    ),
    -- İlk yanıt süreleri
    day_fr_secs AS (
      SELECT EXTRACT(EPOCH FROM (first_ts - origin_ts)) AS first_sec
      FROM day_fr
      WHERE first_ts IS NOT NULL AND origin_ts IS NOT NULL
    ),
    -- Kapanış yapan kişi başına istatistik
    close_emp AS (
      SELECT closer_emp, COUNT(*) AS close_cnt
      FROM day_fc
      GROUP BY closer_emp
    ),
    -- Kapanan corr'lar üzerinde ilk yanıt sürelerini closer_emp'e bağla
    fr_on_fc AS (
      SELECT dfc.closer_emp,
             EXTRACT(EPOCH FROM (dfr.first_ts - dfr.origin_ts)) AS first_sec
      FROM day_fc dfc
      JOIN day_fr dfr ON dfr.corr = dfc.corr
      WHERE dfr.first_ts IS NOT NULL AND dfr.origin_ts IS NOT NULL
    ),
    -- Kişi bazında Ø İlk Yanıt
    close_emp_with_kt AS (
      SELECT c.closer_emp,
             c.close_cnt,
             AVG(f.first_sec) AS avg_first_emp
      FROM close_emp c
      LEFT JOIN fr_on_fc f ON f.closer_emp = c.closer_emp
      GROUP BY c.closer_emp, c.close_cnt
    ),
    -- 60 sn üzeri ilk yanıt sayıları (kişi bazında)
    slow_by_emp AS (
      SELECT closer_emp, COUNT(*) AS gt60_cnt
      FROM fr_on_fc
      WHERE first_sec > :sla_first
      GROUP BY closer_emp
    )
    SELECT
      -- Genel
      (SELECT COUNT(*) FROM day_fc) AS total_close,
      (SELECT AVG(first_sec) FROM day_fr_secs) AS avg_first_sec,
      (SELECT COUNT(*) FROM day_fr_secs WHERE first_sec > :sla_first) AS sla_first_cnt,
      -- Geç Yanıt Verenler (isim + adet, gt60_cnt>0)
      (
        SELECT json_agg(x ORDER BY x.gt60_cnt DESC, x.full_name ASC)
        FROM (
          SELECT em.full_name, s.gt60_cnt
          FROM slow_by_emp s
          JOIN employees em ON em.employee_id = s.closer_emp
          WHERE s.gt60_cnt > 0
        ) AS x
      ) AS slow_list,
      -- Personel Bazlı İşlem Sayıları (tüm bonus personelleri: isim + close_cnt + Ø ilk yanıt)
      (
        SELECT json_agg(x ORDER BY x.close_cnt DESC, x.avg_first_emp ASC NULLS LAST, x.full_name ASC)
        FROM (
          SELECT em.full_name, c.close_cnt, ck.avg_first_emp
          FROM close_emp c
          JOIN employees em ON em.employee_id = c.closer_emp
          LEFT JOIN close_emp_with_kt ck ON ck.closer_emp = c.closer_emp
        ) AS x
      ) AS per_emp
    ;
    """

def build_bonus_daily_text(rows, target_day: date, sla_first_sec: int) -> str:
    # Genel
    total = int(rows["total_close"] or 0)
    avg_first_sec = rows["avg_first_sec"]
    sla_first_cnt = int(rows["sla_first_cnt"] or 0)

    # Listeler
    slow_list = rows.get("slow_list") or []
    per_emp   = rows.get("per_emp") or []

    date_str = target_day.strftime("%d.%m.%Y")
    lines: list[str] = []
    lines.append("━━━━━━━━━━━━━━━━━━")
    lines.append(f"📣 BONUS • Gün Sonu Raporu")
    lines.append(f"🗓️ {date_str}")
    lines.append("━━━━━━━━━━━━━━━━━━\n")

    # Genel
    lines.append("📊 Genel")
    lines.append(f"• Toplam Kapanış: {total}")
    lines.append(f"• Ø İlk Yanıt: {int(round(avg_first_sec)) if avg_first_sec is not None else '—'} sn")
    lines.append(f"• 60 sn üzeri işlemler: {sla_first_cnt}\n")

    # Geç Yanıt Verenler
    lines.append("⚠️ Geç Yanıt Verenler (60 sn üzeri)")
    if slow_list:
        for item in slow_list:
            lines.append(f"• {item.get('full_name') or '-'} — {int(item.get('gt60_cnt') or 0)} işlem")
    else:
        lines.append("• —")
    lines.append("")

    # Personel Bazlı
    lines.append("👥 Personel Bazlı İşlem Sayıları")
    if per_emp:
        for item in per_emp:
            full_name = item.get("full_name") or "-"
            cnt = int(item.get("close_cnt") or 0)
            avg_emp = item.get("avg_first_emp")
            avg_txt = f"{int(round(avg_emp))} sn" if avg_emp is not None else "—"
            lines.append(f"• {full_name} — {cnt} işlem • Ø {avg_txt}")
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

# ---------------- 2 Saatlik (hafif) - Mevcut hali korunur ----------------
# (send_bonus_periodic_2h ve yardımcıları aynı bırakıldı)
