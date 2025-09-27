# apps/api/app/services/telegram_notify.py
import requests
from app.core.admin_tasks_config import ADMIN_TASKS_TG_TOKEN, ADMIN_TASKS_TG_CHAT_ID

def send_text(text: str, parse_mode: str = "Markdown") -> bool:
    if not ADMIN_TASKS_TG_TOKEN or not ADMIN_TASKS_TG_CHAT_ID:
        return False
    try:
        resp = requests.post(
            f"https://api.telegram.org/bot{ADMIN_TASKS_TG_TOKEN}/sendMessage",
            json={
                "chat_id": int(ADMIN_TASKS_TG_CHAT_ID),
                "text": text,
                "parse_mode": parse_mode,   # 🔑 burası eklendi
            },
            timeout=5,
        )
        return resp.ok
    except Exception:
        return False
