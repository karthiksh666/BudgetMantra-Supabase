"""
Circle feature — shared expense tracking between friends/family.
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone
import uuid
import secrets
from app.auth import get_current_user
from app.database import get_admin_db

router = APIRouter(prefix="/circle", tags=["circle"])


class CircleCreate(BaseModel):
    name: str
    description: str = ""


class CircleExpenseCreate(BaseModel):
    description: str
    amount: float
    paid_by: str          # user_id who paid
    split_type: str = "equal"   # equal | custom
    splits: Optional[dict] = None  # {user_id: amount}
    date: Optional[str] = None
    category: str = "other"


@router.get("")
async def list_circles(current_user: dict = Depends(get_current_user)):
    supabase = get_admin_db()
    # Get circles where user is a member
    memberships = supabase.table("circle_members").select("circle_id").eq("user_id", current_user["id"]).execute().data or []
    circle_ids = [m["circle_id"] for m in memberships]
    if not circle_ids:
        return []
    circles = supabase.table("circles").select("*").in_("id", circle_ids).execute().data or []
    return circles


@router.post("", status_code=201)
async def create_circle(body: CircleCreate, current_user: dict = Depends(get_current_user)):
    supabase = get_admin_db()
    circle_id  = str(uuid.uuid4())
    invite_code = secrets.token_urlsafe(6).upper()
    circle = {
        "id": circle_id,
        "name": body.name,
        "description": body.description,
        "created_by": current_user["id"],
        "invite_code": invite_code,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    supabase.table("circles").insert(circle).execute()
    # Auto-add creator as member
    supabase.table("circle_members").insert({
        "id": str(uuid.uuid4()),
        "circle_id": circle_id,
        "user_id": current_user["id"],
        "name": current_user.get("name", ""),
        "joined_at": datetime.now(timezone.utc).isoformat(),
    }).execute()
    return circle


@router.post("/join")
async def join_circle(body: dict, current_user: dict = Depends(get_current_user)):
    invite_code = (body.get("invite_code") or "").strip().upper()
    supabase = get_admin_db()
    circle = supabase.table("circles").select("*").eq("invite_code", invite_code).single().execute()
    if not circle.data:
        raise HTTPException(404, "Invalid invite code")
    # Check if already a member
    existing = supabase.table("circle_members").select("id").eq("circle_id", circle.data["id"]).eq("user_id", current_user["id"]).execute()
    if existing.data:
        return circle.data
    supabase.table("circle_members").insert({
        "id": str(uuid.uuid4()),
        "circle_id": circle.data["id"],
        "user_id": current_user["id"],
        "name": current_user.get("name", ""),
        "joined_at": datetime.now(timezone.utc).isoformat(),
    }).execute()
    return circle.data


@router.get("/{circle_id}")
async def get_circle(circle_id: str, current_user: dict = Depends(get_current_user)):
    supabase = get_admin_db()
    circle = supabase.table("circles").select("*").eq("id", circle_id).single().execute()
    if not circle.data:
        raise HTTPException(404, "Circle not found")
    members = supabase.table("circle_members").select("*").eq("circle_id", circle_id).execute().data or []
    return {**circle.data, "members": members}


@router.delete("/{circle_id}")
async def delete_circle(circle_id: str, current_user: dict = Depends(get_current_user)):
    supabase = get_admin_db()
    circle = supabase.table("circles").select("created_by").eq("id", circle_id).single().execute()
    if not circle.data or circle.data["created_by"] != current_user["id"]:
        raise HTTPException(403, "Only the creator can delete this circle")
    supabase.table("circle_expenses").delete().eq("circle_id", circle_id).execute()
    supabase.table("circle_members").delete().eq("circle_id", circle_id).execute()
    supabase.table("circles").delete().eq("id", circle_id).execute()
    return {"ok": True}


@router.post("/{circle_id}/leave")
async def leave_circle(circle_id: str, current_user: dict = Depends(get_current_user)):
    supabase = get_admin_db()
    supabase.table("circle_members").delete().eq("circle_id", circle_id).eq("user_id", current_user["id"]).execute()
    return {"ok": True}


@router.get("/{circle_id}/expenses")
async def get_circle_expenses(circle_id: str, current_user: dict = Depends(get_current_user)):
    supabase = get_admin_db()
    expenses = supabase.table("circle_expenses").select("*").eq("circle_id", circle_id).order("created_at", desc=True).execute().data or []
    return expenses


@router.post("/{circle_id}/expenses", status_code=201)
async def add_circle_expense(circle_id: str, body: CircleExpenseCreate, current_user: dict = Depends(get_current_user)):
    supabase = get_admin_db()
    # Get members for equal split
    members = supabase.table("circle_members").select("user_id").eq("circle_id", circle_id).execute().data or []
    if body.split_type == "equal" and members:
        per_person = round(body.amount / len(members), 2)
        splits = {m["user_id"]: per_person for m in members}
    else:
        splits = body.splits or {}
    doc = {
        "id": str(uuid.uuid4()),
        "circle_id": circle_id,
        "description": body.description,
        "amount": body.amount,
        "paid_by": body.paid_by,
        "split_type": body.split_type,
        "splits": splits,
        "date": body.date or datetime.now(timezone.utc).date().isoformat(),
        "category": body.category,
        "created_by": current_user["id"],
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    res = supabase.table("circle_expenses").insert(doc).execute()
    return res.data[0]


@router.delete("/{circle_id}/expenses/{expense_id}")
async def delete_circle_expense(circle_id: str, expense_id: str, current_user: dict = Depends(get_current_user)):
    supabase = get_admin_db()
    supabase.table("circle_expenses").delete().eq("id", expense_id).eq("circle_id", circle_id).execute()
    return {"ok": True}


@router.get("/{circle_id}/balances")
async def get_circle_balances(circle_id: str, current_user: dict = Depends(get_current_user)):
    supabase = get_admin_db()
    expenses = supabase.table("circle_expenses").select("*").eq("circle_id", circle_id).execute().data or []
    members  = supabase.table("circle_members").select("*").eq("circle_id", circle_id).execute().data or []

    # Net balance per person: positive = owed money, negative = owes money
    balances: dict = {m["user_id"]: 0.0 for m in members}
    for exp in expenses:
        paid_by = exp.get("paid_by")
        splits  = exp.get("splits") or {}
        if paid_by in balances:
            balances[paid_by] += exp.get("amount", 0)
        for uid, share in splits.items():
            if uid in balances:
                balances[uid] -= share

    member_map = {m["user_id"]: m.get("name", m["user_id"]) for m in members}
    return [
        {"user_id": uid, "name": member_map.get(uid, uid), "balance": round(bal, 2)}
        for uid, bal in balances.items()
    ]


@router.post("/{circle_id}/settle")
async def settle_circle(circle_id: str, current_user: dict = Depends(get_current_user)):
    supabase = get_admin_db()
    supabase.table("circle_expenses").delete().eq("circle_id", circle_id).execute()
    return {"ok": True, "message": "All expenses settled and cleared."}
