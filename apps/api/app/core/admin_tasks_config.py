# apps/api/app/core/admin_tasks_config.py
from datetime import datetime, timedelta
import os
import pytz

IST = pytz.timezone("Europe/Istanbul")

ADMIN_TASKS_TG_TOKEN = os.getenv("ADMIN_TASKS_TG_TOKEN", "")
ADMIN_TASKS_TG_CHAT_ID = os.getenv("ADMIN_TASKS_TG_CHAT_ID", "")

# Vardiya bitişleri (fallback); Vardiyalar tablosu eklemek isterseniz burayı DB'den okuyun.
SHIFT_END = {
    "Sabah": (16, 0),
    "Öğlen": (20, 0),
    "Akşam": (24, 0),  # ertesi 00:00
    "Gece":  (7, 59),  # aynı gün 07:59
}

def shift_end_dt(date_ist, shift: str):
    h,m = SHIFT_END.get(shift or "", (23,59))
    base = IST.localize(datetime(date_ist.year, date_ist.month, date_ist.day, 0,0,0))
    end = base + timedelta(hours=h, minutes=m)
    if h == 24:
        end = base + timedelta(days=1)  # 00:00 ertesi
    return end.astimezone(pytz.UTC)
