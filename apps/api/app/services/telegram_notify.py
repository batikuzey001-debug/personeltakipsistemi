from __future__ import annotations
import requests
from app.core.admin_tasks_config import (
    ADMIN_TASKS_TG_TOKEN,
    ADMIN_TASKS_TG_CHAT_ID,
    BONUS_TG_CHAT_ID,
)

def _post(chat_id: int | str, text: str, parse_mode: str = "Markdown") -> bool:
    if not ADMIN_TASKS_TG_TOKEN or not chat_id:
        return False
    try:
        resp = requests.post(
            f"https://api.telegram.org/bot{ADMIN_TASKS_TG_TOKEN}/sendMessage",
            json={"chat_id": int(chat_id), "text": text, "parse_mode": parse_mode},
            timeout=5,
        )
        return resp.ok
    except Exception:
        return False

def send_text(text: str, parse_mode: str = "Markdown", chat_id: int | str | None = None) -> bool:
    """Genel grup (veya istenirse tek seferlik başka chat)"""
    target = chat_id or ADMIN_TASKS_TG_CHAT_ID
    return _post(target, text, parse_mode=parse_mode)

def send_bonus(text: str, parse_mode: str = "Markdown") -> bool:
    """Bonus’a özel grup (BONUS_TG_CHAT_ID). Tanımlı değilse False döner."""
    if not BONUS_TG_CHAT_ID:
        return False
    return _post(BONUS_TG_CHAT_ID, text, parse_mode=parse_mode)

def send_bonus_to_both(text: str, parse_mode: str = "Markdown") -> bool:
    """Bonus mesajını hem genel gruba hem bonus grubuna yollar (en az biri başarılıysa True)."""
    ok_bonus = send_bonus(text, parse_mode=parse_mode)
    ok_general = send_text(text, parse_mode=parse_mode)
    return bool(ok_bonus or ok_general)
