# apps/api/app/schemas/org.py
from pydantic import BaseModel, EmailStr
from datetime import date

class TeamOut(BaseModel):
    id: int
    name: str
    parent_id: int | None
    class Config:
        from_attributes = True

class EmployeeOut(BaseModel):
    employee_id: str
    full_name: str
    email: EmailStr | None
    team_id: int | None
    title: str | None
    hired_at: date | None
    status: str
    # Kart ek alanları
    telegram_username: str | None = None
    telegram_user_id: int | None = None
    phone: str | None = None
    salary_gross: float | None = None
    notes: str | None = None

    class Config:
        from_attributes = True

class EmployeeUpdateIn(BaseModel):
    full_name: str | None = None
    email: EmailStr | None = None
    team_id: int | None = None
    title: str | None = None
    hired_at: date | None = None
    status: str | None = None  # "active" | "inactive"

    # Kart ek alanları
    telegram_username: str | None = None
    telegram_user_id: int | None = None
    phone: str | None = None
    salary_gross: float | None = None
    notes: str | None = None
