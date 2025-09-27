# apps/api/app/api/routes_admin_bot.py  (yalnızca bu fonksiyonu değiştir)

@router.post("/trigger/bonus/periodic")
def trigger_bonus_periodic(
    end: str | None = Query(None, description="IST bitiş (YYYY-MM-DDTHH:MM); default=now"),
    kt30_sec: int = Query(30, ge=1, le=3600),   # 30 sn eşiği (isteğe göre değiştirilebilir)
    db: Session = Depends(get_db),
):
    # Bildirim açık mı?
    if not get_bool(db, BONUS_TG_ENABLED_KEY, False):
        raise HTTPException(status_code=400, detail="bonus notifications disabled")

    # Pencere bitişi (IST)
    if end:
        try:
            end_ist = IST.localize(datetime.strptime(end, "%Y-%m-%dT%H:%M"))
        except Exception:
            raise HTTPException(status_code=400, detail="end format YYYY-MM-DDTHH:MM")
    else:
        end_ist = datetime.now(IST)

    # Metrikler: 2 saatlik özet + kişi bazlı toplamlar + 30 sn üzeri listesi
    ctx = compute_bonus_periodic_context(db, end_ist, hours=2, kt30_sec=kt30_sec)

    # Personel bazında toplam işlem sayıları (bold sayılar)
    per_emp_text = "\n".join(
        [f"- {i.get('full_name','-')} — *{int(i.get('close_cnt') or 0)}* işlem" for i in ctx["per_emp"]]
    ) or "- —"

    # 30 sn üzeri İlk KT uyarı bloğu (varsa)
    slow30_text = "\n".join(
        [f"- {i.get('full_name','-')} — *{int(i.get('gt30_cnt') or 0)}* işlem" for i in ctx["slow_30"]]
    )
    slow30_block = f"\n\n⚠️ *{kt30_sec} sn üzeri İlk KT*\n{slow30_text}" if slow30_text else ""

    # Render context
    message_ctx = {
        "date": ctx["date_label"],
        "win_start": ctx["win_start"], "win_end": ctx["win_end"],
        "total_close": ctx["total_close"],
        "per_emp_text": per_emp_text,
        "slow30_block": slow30_block,
    }

    # Çizgisiz & bold fallback (2 saatlik)
    fallback = (
        "⏱️ *BONUS 2 SAATLİK RAPOR* — *{date} {win_start}–{win_end}*\n\n"
        "• *Toplam Kapanış:* {total_close}\n\n"
        "👤 *Personel Bazında*\n"
        "{per_emp_text}"
        "{slow30_block}"
    )

    text_msg = render(db, "bonus_periodic_v2", message_ctx, fallback, channel="bonus")
    if not send_text(text_msg):
        raise HTTPException(status_code=400, detail="send failed")
    return {"ok": True, "window": f"{ctx['win_start']}-{ctx['win_end']}", "date": ctx["date_label"]}
