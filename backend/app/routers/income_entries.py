from fastapi import APIRouter, Depends
from pydantic import BaseModel
from typing import Optional
from datetime import date
from app.auth import get_current_user
from app.database import get_admin_db

router = APIRouter(prefix="/income-entries", tags=["income-entries"])


class IncomeEntryInput(BaseModel):
    amount: float
    source_type: str = "salary"
    source: Optional[str] = ""
    description: Optional[str] = ""
    date: Optional[str] = None
    is_recurring: bool = False


@router.get("")
async def list_income_entries(current_user: dict = Depends(get_current_user)):
    supabase = get_admin_db()
    res = supabase.table("income_entries").select("*").eq("user_id", current_user["id"]).order("date", desc=True).execute()
    return res.data or []


@router.get("/month-summary")
async def month_summary(current_user: dict = Depends(get_current_user)):
    from datetime import datetime
    supabase = get_admin_db()
    now = datetime.now()
    start = f"{now.year}-{now.month:02d}-01"
    res = supabase.table("income_entries").select("amount,source_type").eq("user_id", current_user["id"]).gte("date", start).execute()
    entries = res.data or []
    total = sum(e["amount"] for e in entries)
    by_type: dict = {}
    for e in entries:
        by_type[e["source_type"]] = by_type.get(e["source_type"], 0) + e["amount"]
    return {"total": total, "count": len(entries), "by_type": by_type}


@router.post("")
async def create_income_entry(body: IncomeEntryInput, current_user: dict = Depends(get_current_user)):
    supabase = get_admin_db()
    doc = {
        "user_id": current_user["id"],
        "amount": body.amount,
        "source_type": body.source_type,
        "source": body.source or "",
        "description": body.description or "",
        "date": body.date or str(date.today()),
        "is_recurring": body.is_recurring,
    }
    res = supabase.table("income_entries").insert(doc).execute()
    return res.data[0]


@router.put("/{entry_id}")
async def update_income_entry(entry_id: str, body: IncomeEntryInput, current_user: dict = Depends(get_current_user)):
    supabase = get_admin_db()
    updates = body.model_dump(exclude_none=True)
    res = supabase.table("income_entries").update(updates).eq("id", entry_id).eq("user_id", current_user["id"]).execute()
    return res.data[0] if res.data else {}


@router.delete("/{entry_id}")
async def delete_income_entry(entry_id: str, current_user: dict = Depends(get_current_user)):
    supabase = get_admin_db()
    supabase.table("income_entries").delete().eq("id", entry_id).eq("user_id", current_user["id"]).execute()
    return {"ok": True}
