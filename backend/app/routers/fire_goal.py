"""FIRE Goal — Financial Independence / Retire Early goal tracker."""
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone
import uuid
from app.auth import get_current_user
from app.database import get_admin_db

router = APIRouter(prefix="/fire-goal", tags=["fire-goal"])


class FireGoalInput(BaseModel):
    model_config = {"extra": "ignore"}

    fire_number: float
    fire_type: str = "regular"           # lean | regular | fat | custom
    withdrawal_rate: float = 4.0
    target_year: int
    current_savings: float
    monthly_expenses: float
    monthly_savings_needed: float
    monthly_income: float = 0
    current_age: int
    target_age: int
    coast_fire_number: float = 0
    barista_monthly_income: float = 0
    notes: str = ""


@router.get("")
async def get_fire_goal(current_user: dict = Depends(get_current_user)):
    """Return the user's saved FIRE goal, or null if not set."""
    supabase = get_admin_db()
    res = supabase.table("fire_goals").select("*").eq("user_id", current_user["id"]).limit(1).execute()
    if not res.data:
        return None
    return res.data[0]


@router.post("", status_code=201)
async def save_fire_goal(body: FireGoalInput, current_user: dict = Depends(get_current_user)):
    """Create or overwrite the user's FIRE goal (one per user)."""
    supabase = get_admin_db()
    uid = current_user["id"]
    now = datetime.now(timezone.utc).isoformat()

    existing = supabase.table("fire_goals").select("id,created_at").eq("user_id", uid).limit(1).execute()

    doc = {
        "user_id": uid,
        **body.model_dump(),
        "updated_at": now,
    }

    if existing.data:
        record_id = existing.data[0]["id"]
        doc["id"] = record_id
        doc["created_at"] = existing.data[0].get("created_at", now)
        res = supabase.table("fire_goals").update(doc).eq("id", record_id).execute()
    else:
        doc["id"] = str(uuid.uuid4())
        doc["created_at"] = now
        res = supabase.table("fire_goals").insert(doc).execute()

    return res.data[0] if res.data else doc


@router.delete("")
async def delete_fire_goal(current_user: dict = Depends(get_current_user)):
    """Delete the user's FIRE goal."""
    supabase = get_admin_db()
    supabase.table("fire_goals").delete().eq("user_id", current_user["id"]).execute()
    return {"ok": True}
