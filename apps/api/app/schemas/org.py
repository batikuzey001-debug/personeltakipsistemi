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
    department: str | None
    title: str | None
    hired_at: date | None
    status: str
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
    department: str | None = None  # "Call Center" | "Canlı" | "Finans" | "Bonus" | "Admin"
    title: str | None = None
    hired_at: date | None = None
    status: str | None = None

    telegram_username: str | None = None
    telegram_user_id: int | None = None
    phone: str | None = None
    salary_gross: float | None = None
    notes: str | None = None
