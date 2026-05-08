from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone, date
import uuid
from app.auth import get_current_user
from app.database import get_admin_db

router = APIRouter(tags=["recurring-income"])


class ProfileBody(BaseModel):
    name: str
    amount: float
    frequency: str = "monthly"
    source_type: str = "salary"
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    notes: str = ""


@router.get("/recurring-income-profiles")
async def list_profiles(current_user: dict = Depends(get_current_user)):
    supabase = get_admin_db()
    res = supabase.table("recurring_income_profiles").select("*").eq("user_id", current_user["id"]).eq("active", True).order("created_at", desc=True).execute()
    return res.data or []


@router.post("/recurring-income-profiles", status_code=201)
async def create_profile(body: ProfileBody, current_user: dict = Depends(get_current_user)):
    supabase = get_admin_db()
    now = datetime.now(timezone.utc).isoformat()
    doc = {
        "id": str(uuid.uuid4()),
        "user_id": current_user["id"],
        "name": body.name,
        "amount": body.amount,
        "frequency": body.frequency,
        "source_type": body.source_type,
        "start_date": body.start_date or date.today().isoformat(),
        "end_date": body.end_date,
        "active": True,
        "notes": body.notes,
        "created_at": now,
        "updated_at": now,
    }
    res = supabase.table("recurring_income_profiles").insert(doc).execute()
    return res.data[0] if res.data else doc


@router.put("/recurring-income-profiles/{profile_id}")
async def update_profile(profile_id: str, body: ProfileBody, current_user: dict = Depends(get_current_user)):
    supabase = get_admin_db()
    existing = supabase.table("recurring_income_profiles").select("id").eq("id", profile_id).eq("user_id", current_user["id"]).execute()
    if not existing.data:
        raise HTTPException(status_code=404, detail="Profile not found")
    updates = {**body.model_dump(), "updated_at": datetime.now(timezone.utc).isoformat()}
    res = supabase.table("recurring_income_profiles").update(updates).eq("id", profile_id).eq("user_id", current_user["id"]).execute()
    return res.data[0] if res.data else updates


@router.post("/recurring-income-profiles/{profile_id}/stop")
async def stop_profile(profile_id: str, current_user: dict = Depends(get_current_user)):
    supabase = get_admin_db()
    existing = supabase.table("recurring_income_profiles").select("id").eq("id", profile_id).eq("user_id", current_user["id"]).execute()
    if not existing.data:
        raise HTTPException(status_code=404, detail="Profile not found")
    supabase.table("recurring_income_profiles").update({
        "active": False,
        "end_date": date.today().isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }).eq("id", profile_id).execute()
    return {"ok": True}


@router.delete("/recurring-income-profiles/{profile_id}", status_code=204)
async def delete_profile(profile_id: str, current_user: dict = Depends(get_current_user)):
    supabase = get_admin_db()
    supabase.table("recurring_income_profiles").delete().eq("id", profile_id).eq("user_id", current_user["id"]).execute()
