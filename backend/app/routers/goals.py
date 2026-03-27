from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional
from datetime import datetime
import uuid
from app.auth import get_current_user
from app.database import get_supabase

router = APIRouter(prefix="/goals", tags=["goals"])


class GoalCreate(BaseModel):
    name: str
    target_amount: float
    target_date: str
    current_amount: float = 0
    icon: str = "🎯"
    category: str = "general"
    auto_deduct: bool = False
    monthly_contribution: float = 0


class GoalUpdate(BaseModel):
    name: Optional[str] = None
    target_amount: Optional[float] = None
    target_date: Optional[str] = None
    icon: Optional[str] = None
    auto_deduct: Optional[bool] = None
    monthly_contribution: Optional[float] = None


class ContributionCreate(BaseModel):
    amount: float
    note: str = ""
    date: Optional[str] = None


@router.get("")
async def list_goals(current_user: dict = Depends(get_current_user)):
    supabase = get_supabase()
    res = supabase.table("savings_goals").select("*").eq("user_id", current_user["id"]).order("created_at").execute()
    return res.data or []


@router.post("", status_code=201)
async def create_goal(body: GoalCreate, current_user: dict = Depends(get_current_user)):
    supabase = get_supabase()
    doc = {
        "id": str(uuid.uuid4()),
        "user_id": current_user["id"],
        **body.model_dump(),
        "created_at": datetime.utcnow().isoformat(),
    }
    res = supabase.table("savings_goals").insert(doc).execute()
    return res.data[0]


@router.put("/{goal_id}")
async def update_goal(goal_id: str, body: GoalUpdate, current_user: dict = Depends(get_current_user)):
    supabase = get_supabase()
    updates = body.model_dump(exclude_none=True)
    res = supabase.table("savings_goals").update(updates).eq("id", goal_id).eq("user_id", current_user["id"]).execute()
    if not res.data:
        raise HTTPException(404, "Goal not found")
    return res.data[0]


@router.delete("/{goal_id}")
async def delete_goal(goal_id: str, current_user: dict = Depends(get_current_user)):
    supabase = get_supabase()
    supabase.table("savings_goals").delete().eq("id", goal_id).eq("user_id", current_user["id"]).execute()
    return {"ok": True}


@router.post("/{goal_id}/contribute", status_code=201)
async def contribute(goal_id: str, body: ContributionCreate, current_user: dict = Depends(get_current_user)):
    supabase = get_supabase()
    goal = supabase.table("savings_goals").select("*").eq("id", goal_id).eq("user_id", current_user["id"]).single().execute()
    if not goal.data:
        raise HTTPException(404, "Goal not found")

    contribution = {
        "id": str(uuid.uuid4()),
        "goal_id": goal_id,
        "user_id": current_user["id"],
        "amount": body.amount,
        "note": body.note,
        "date": body.date or datetime.utcnow().date().isoformat(),
        "created_at": datetime.utcnow().isoformat(),
    }
    supabase.table("goal_contributions").insert(contribution).execute()

    new_amount = (goal.data.get("current_amount") or 0) + body.amount
    supabase.table("savings_goals").update({"current_amount": new_amount}).eq("id", goal_id).execute()

    return contribution
