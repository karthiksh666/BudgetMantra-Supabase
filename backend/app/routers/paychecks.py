from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone
import uuid
from app.auth import get_current_user
from app.database import get_admin_db

router = APIRouter(prefix="/paychecks", tags=["paychecks"])


class PaycheckCreate(BaseModel):
    month: str                   # "2025-03"
    gross_salary: float
    net_salary: float
    deductions: dict = {}
    bonuses: float = 0


@router.get("")
async def list_paychecks(current_user: dict = Depends(get_current_user)):
    supabase = get_admin_db()
    res = supabase.table("paychecks").select("*").eq("user_id", current_user["id"]).order("month", desc=True).execute()
    return res.data or []


@router.post("", status_code=201)
async def create_paycheck(body: PaycheckCreate, current_user: dict = Depends(get_current_user)):
    supabase = get_admin_db()
    doc = {"id": str(uuid.uuid4()), "user_id": current_user["id"], **body.model_dump(),
           "created_at": datetime.now(timezone.utc).isoformat()}
    # Upsert by month
    existing = supabase.table("paychecks").select("id").eq("user_id", current_user["id"]).eq("month", body.month).execute()
    if existing.data:
        res = supabase.table("paychecks").update(body.model_dump()).eq("id", existing.data[0]["id"]).execute()
    else:
        res = supabase.table("paychecks").insert(doc).execute()
    return res.data[0]


@router.delete("/{month}")
async def delete_paycheck(month: str, current_user: dict = Depends(get_current_user)):
    supabase = get_admin_db()
    supabase.table("paychecks").delete().eq("user_id", current_user["id"]).eq("month", month).execute()
    return {"ok": True}


@router.get("/lifetime-stats")
async def lifetime_stats(current_user: dict = Depends(get_current_user)):
    supabase = get_admin_db()
    res = supabase.table("paychecks").select("*").eq("user_id", current_user["id"]).order("month").execute()
    paychecks = res.data or []
    if not paychecks:
        return {"total_earned": 0, "avg_monthly": 0, "months_tracked": 0, "highest_month": None}
    totals = [float(p["net_salary"]) + float(p.get("bonuses") or 0) for p in paychecks]
    return {
        "total_earned": round(sum(totals), 2),
        "avg_monthly": round(sum(totals) / len(totals), 2),
        "months_tracked": len(paychecks),
        "highest_month": paychecks[totals.index(max(totals))]["month"],
    }
