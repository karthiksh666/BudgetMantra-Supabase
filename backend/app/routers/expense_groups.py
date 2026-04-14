from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, date, timezone
import uuid
from app.auth import get_current_user
from app.database import get_admin_db

router = APIRouter(prefix="/expense-groups", tags=["expense-groups"])


class GroupCreate(BaseModel):
    name: str
    description: str = ""
    members: list[str] = []


class GroupExpenseCreate(BaseModel):
    description: str
    amount: float
    paid_by: str
    split_among: list[str]
    date: Optional[str] = None
    category: str = "general"


class SettlementCreate(BaseModel):
    from_member: str
    to_member: str
    amount: float


@router.get("")
async def list_groups(current_user: dict = Depends(get_current_user)):
    supabase = get_admin_db()
    res = supabase.table("expense_groups").select("*").eq("user_id", current_user["id"]).order("created_at", desc=True).execute()
    return res.data or []


@router.post("", status_code=201)
async def create_group(body: GroupCreate, current_user: dict = Depends(get_current_user)):
    supabase = get_admin_db()
    doc = {"id": str(uuid.uuid4()), "user_id": current_user["id"], **body.model_dump(),
           "created_at": datetime.now(timezone.utc).isoformat()}
    res = supabase.table("expense_groups").insert(doc).execute()
    return res.data[0]


@router.delete("/{group_id}")
async def delete_group(group_id: str, current_user: dict = Depends(get_current_user)):
    supabase = get_admin_db()
    supabase.table("expense_groups").delete().eq("id", group_id).eq("user_id", current_user["id"]).execute()
    return {"ok": True}


@router.get("/{group_id}/expenses")
async def list_expenses(group_id: str, current_user: dict = Depends(get_current_user)):
    supabase = get_admin_db()
    res = supabase.table("group_expenses").select("*").eq("group_id", group_id).eq("user_id", current_user["id"]).order("date", desc=True).execute()
    return res.data or []


@router.post("/{group_id}/expenses", status_code=201)
async def add_expense(group_id: str, body: GroupExpenseCreate, current_user: dict = Depends(get_current_user)):
    supabase = get_admin_db()
    doc = {"id": str(uuid.uuid4()), "group_id": group_id, "user_id": current_user["id"],
           **body.model_dump(), "date": body.date or date.today().isoformat(),
           "created_at": datetime.now(timezone.utc).isoformat()}
    res = supabase.table("group_expenses").insert(doc).execute()
    return res.data[0]


@router.put("/{group_id}/expenses/{expense_id}")
async def update_expense(group_id: str, expense_id: str, body: GroupExpenseCreate, current_user: dict = Depends(get_current_user)):
    supabase = get_admin_db()
    updates = body.model_dump(exclude_none=True)
    res = supabase.table("group_expenses").update(updates).eq("id", expense_id).eq("user_id", current_user["id"]).execute()
    if not res.data:
        raise HTTPException(404, "Expense not found")
    return res.data[0]


@router.delete("/{group_id}/expenses/{expense_id}")
async def delete_expense(group_id: str, expense_id: str, current_user: dict = Depends(get_current_user)):
    supabase = get_admin_db()
    supabase.table("group_expenses").delete().eq("id", expense_id).eq("user_id", current_user["id"]).execute()
    return {"ok": True}


@router.get("/{group_id}/balances")
async def balances(group_id: str, current_user: dict = Depends(get_current_user)):
    supabase = get_admin_db()
    expenses = supabase.table("group_expenses").select("*").eq("group_id", group_id).eq("user_id", current_user["id"]).execute()
    settlements = supabase.table("group_settlements").select("*").eq("group_id", group_id).eq("user_id", current_user["id"]).execute()

    net: dict[str, float] = {}
    for e in (expenses.data or []):
        amt = float(e["amount"])
        split = e["split_among"] or []
        per_person = amt / len(split) if split else 0
        net[e["paid_by"]] = net.get(e["paid_by"], 0) + amt
        for m in split:
            net[m] = net.get(m, 0) - per_person

    for s in (settlements.data or []):
        net[s["from_member"]] = net.get(s["from_member"], 0) + float(s["amount"])
        net[s["to_member"]] = net.get(s["to_member"], 0) - float(s["amount"])

    return [{"member": k, "balance": round(v, 2)} for k, v in net.items()]


@router.post("/{group_id}/settle", status_code=201)
async def settle(group_id: str, body: SettlementCreate, current_user: dict = Depends(get_current_user)):
    supabase = get_admin_db()
    doc = {"id": str(uuid.uuid4()), "group_id": group_id, "user_id": current_user["id"],
           **body.model_dump(), "date": date.today().isoformat(), "created_at": datetime.now(timezone.utc).isoformat()}
    res = supabase.table("group_settlements").insert(doc).execute()
    return res.data[0]


@router.get("/{group_id}/settlements")
async def list_settlements(group_id: str, current_user: dict = Depends(get_current_user)):
    supabase = get_admin_db()
    res = supabase.table("group_settlements").select("*").eq("group_id", group_id).eq("user_id", current_user["id"]).execute()
    return res.data or []
