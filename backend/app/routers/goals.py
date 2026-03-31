from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, date
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


# ── Savings Goals Summary (Dashboard) ────────────────────────────────────────

@router.get("/savings-goals-summary")
async def savings_goals_summary(current_user: dict = Depends(get_current_user)):
    supabase = get_supabase()
    goals = supabase.table("savings_goals").select("*").eq("user_id", current_user["id"]).execute()
    goal_list = goals.data or []

    total_target  = sum(g.get("target_amount", 0) for g in goal_list)
    total_saved   = sum(g.get("current_amount", 0) for g in goal_list)
    total_remaining = max(0, total_target - total_saved)

    alerts = []
    for g in goal_list:
        try:
            target_date = datetime.strptime(g["target_date"], "%Y-%m-%d")
            days_remaining = (target_date - datetime.now()).days
            months_remaining = max(1, days_remaining / 30)
            amount_needed = (g.get("target_amount", 0) or 0) - (g.get("current_amount", 0) or 0)
            monthly_needed = amount_needed / months_remaining
            progress = ((g.get("current_amount", 0) or 0) / (g.get("target_amount", 1) or 1)) * 100

            if days_remaining < 0:
                alerts.append({"goal_id": g["id"], "goal_name": g["name"], "type": "overdue", "severity": "high",
                                "message": f"'{g['name']}' target date has passed."})
            elif days_remaining < 30 and amount_needed > 0:
                alerts.append({"goal_id": g["id"], "goal_name": g["name"], "type": "urgent", "severity": "high",
                                "message": f"'{g['name']}' is due in {days_remaining} days. Need ₹{amount_needed:,.0f} more."})
            elif progress >= 100:
                alerts.append({"goal_id": g["id"], "goal_name": g["name"], "type": "completed", "severity": "low",
                                "message": f"'{g['name']}' is fully funded! 🎉"})
        except Exception:
            pass

    return {
        "goals": goal_list,
        "total_target": total_target,
        "total_saved": total_saved,
        "total_remaining": total_remaining,
        "overall_progress": round((total_saved / total_target * 100) if total_target > 0 else 0, 1),
        "alerts": alerts,
    }
