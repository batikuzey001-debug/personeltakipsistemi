# apps/api/app/services/template_engine.py
from __future__ import annotations
from typing import Dict
from sqlalchemy.orm import Session
from sqlalchemy import text

def _get_template(db: Session, name: str, channel: str = "bonus") -> str | None:
    row = db.execute(
        text("""
            SELECT template FROM admin_notifications
            WHERE channel = :ch AND name = :nm AND is_active = TRUE
            LIMIT 1
        """),
        {"ch": channel, "nm": name},
    ).scalar()
    return row

def render(db: Session, template_name: str, context: Dict, fallback: str, channel: str = "bonus") -> str:
    tpl = _get_template(db, template_name, channel) or fallback
    out = tpl
    for k, v in context.items():
        out = out.replace("{"+k+"}", str(v))
    return out
