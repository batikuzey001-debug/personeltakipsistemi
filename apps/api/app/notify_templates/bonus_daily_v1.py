# apps/api/app/notify_templates/bonus_daily_v1.py

def render_bonus_daily(data: dict) -> str:
    """
    BONUS günlük raporu — sade ve bold vurgularla
    """
    d_str = data.get("date") or "—"
    total = data.get("total") or 0
    avg_first = data.get("avg_first") or "—"
    sla_limit = data.get("sla_first_limit") or 60
    sla_cnt = data.get("sla_first_count") or 0
    late_list = data.get("sla_first_late_list") or []
    per_emp = data.get("per_employee") or []

    lines = []
    lines.append(f"📊 *BONUS GÜN SONU RAPORU — {d_str}*")
    lines.append(f"- *Toplam Kapanış:* {total}")
    lines.append(f"- *Ø İlk Yanıt:* {avg_first}")
    lines.append(f"- *{sla_limit} sn üzeri işlemler:* {sla_cnt}")

    if late_list:
        lines.append("")
        lines.append(f"⚠️ *Geç Yanıt Verenler ({sla_limit} sn üzeri)*")
        for r in late_list:
            emp = r.get("employee") or "-"
            cnt = r.get("count") or 0
            lines.append(f"- {emp} — {cnt} işlem")

    if per_emp:
        lines.append("")
        lines.append("👥 *Personel Bazlı İşlem Sayıları*")
        for r in per_emp:
            emp = r.get("employee") or "-"
            cnt = r.get("count") or 0
            avg = r.get("avg_first") or "—"
            lines.append(f"- {emp} — {cnt} işlem • Ø {avg}")

    return "\n".join(lines)
