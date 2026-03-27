from fastapi import APIRouter, Depends
from pydantic import BaseModel
from typing import Optional
from datetime import datetime
import uuid
from app.auth import get_current_user
from app.database import get_supabase

router = APIRouter(prefix="/jobs", tags=["jobs"])


class JobCreate(BaseModel):
    company: str
    title: str
    start_date: str
    end_date: Optional[str] = None
    salary: float = 0
    is_current: bool = False
    location: str = ""
    notes: str = ""


@router.get("")
async def list_jobs(current_user: dict = Depends(get_current_user)):
    supabase = get_supabase()
    res = supabase.table("jobs").select("*").eq("user_id", current_user["id"]).order("start_date", desc=True).execute()
    return res.data or []


@router.post("", status_code=201)
async def create_job(body: JobCreate, current_user: dict = Depends(get_current_user)):
    supabase = get_supabase()
    if body.is_current:
        supabase.table("jobs").update({"is_current": False}).eq("user_id", current_user["id"]).execute()
    doc = {"id": str(uuid.uuid4()), "user_id": current_user["id"], **body.model_dump(),
           "created_at": datetime.utcnow().isoformat()}
    res = supabase.table("jobs").insert(doc).execute()
    return res.data[0]


@router.put("/{job_id}")
async def update_job(job_id: str, body: JobCreate, current_user: dict = Depends(get_current_user)):
    supabase = get_supabase()
    res = supabase.table("jobs").update(body.model_dump()).eq("id", job_id).eq("user_id", current_user["id"]).execute()
    return res.data[0] if res.data else {}


@router.delete("/{job_id}")
async def delete_job(job_id: str, current_user: dict = Depends(get_current_user)):
    supabase = get_supabase()
    supabase.table("jobs").delete().eq("id", job_id).eq("user_id", current_user["id"]).execute()
    return {"ok": True}


@router.get("/career-stats")
async def career_stats(current_user: dict = Depends(get_current_user)):
    supabase = get_supabase()
    jobs = supabase.table("jobs").select("*").eq("user_id", current_user["id"]).order("start_date").execute()
    data = jobs.data or []
    if not data:
        return {"total_companies": 0, "years_exp": 0, "salary_growth": []}
    from datetime import date
    total_months = 0
    for j in data:
        start = datetime.strptime(j["start_date"], "%Y-%m-%d").date()
        end = datetime.strptime(j["end_date"], "%Y-%m-%d").date() if j.get("end_date") else date.today()
        total_months += (end.year - start.year) * 12 + (end.month - start.month)
    return {
        "total_companies": len(data),
        "years_exp": round(total_months / 12, 1),
        "salary_growth": [{"company": j["company"], "salary": j["salary"], "year": j["start_date"][:4]} for j in data],
    }
