from fastapi import APIRouter, Depends
from pydantic import BaseModel
from typing import Optional
from datetime import date, datetime
from calendar import monthrange
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


def _roll_recurring_income(user_id: str) -> None:
    """Back-fill monthly copies of any `is_recurring` income entry from its
    first occurrence through the current month. Idempotent — only inserts a
    month if no matching (source_type, source, amount, is_recurring) entry
    exists in that month.
    """
    supabase = get_admin_db()
    res = (
        supabase.table("income_entries")
        .select("*")
        .eq("user_id", user_id)
        .eq("is_recurring", True)
        .execute()
    )
    entries = res.data or []
    if not entries:
        return

    # Group recurring entries by template key so each distinct recurring
    # stream is handled independently.
    groups: dict = {}
    for e in entries:
        key = (e.get("source_type") or "", e.get("source") or "", float(e.get("amount") or 0))
        groups.setdefault(key, []).append(e)

    today = date.today()
    to_insert: list = []

    for key, items in groups.items():
        source_type, source, amount = key
        items.sort(key=lambda x: x["date"])
        first = items[0]
        try:
            start = datetime.fromisoformat(first["date"]).date()
        except Exception:
            continue
        anchor_day = start.day

        existing_months = {e["date"][:7] for e in items if e.get("date")}

        y, m = start.year, start.month
        # advance to month after the first occurrence
        m += 1
        if m > 12:
            m, y = 1, y + 1

        while (y, m) <= (today.year, today.month):
            ym = f"{y:04d}-{m:02d}"
            if ym not in existing_months:
                day = min(anchor_day, monthrange(y, m)[1])
                to_insert.append({
                    "user_id": user_id,
                    "amount": amount,
                    "source_type": source_type,
                    "source": source,
                    "description": first.get("description") or "",
                    "date": f"{ym}-{day:02d}",
                    "is_recurring": True,
                })
                existing_months.add(ym)
            m += 1
            if m > 12:
                m, y = 1, y + 1

    if to_insert:
        supabase.table("income_entries").insert(to_insert).execute()


@router.get("")
async def list_income_entries(current_user: dict = Depends(get_current_user)):
    supabase = get_admin_db()
    _roll_recurring_income(current_user["id"])
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
