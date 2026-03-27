from fastapi import APIRouter, Depends
from pydantic import BaseModel
from typing import Optional
from datetime import datetime
import uuid
from app.auth import get_current_user
from app.database import get_supabase

router = APIRouter(prefix="/timeline", tags=["timeline"])


class TimelineEventCreate(BaseModel):
    title: str
    date: str
    type: str = "milestone"
    amount: Optional[float] = None
    description: str = ""
    icon: str = "📌"


@router.get("")
async def list_events(current_user: dict = Depends(get_current_user)):
    supabase = get_supabase()
    res = supabase.table("timeline_events").select("*").eq("user_id", current_user["id"]).order("date", desc=True).execute()
    return res.data or []


@router.post("", status_code=201)
async def create_event(body: TimelineEventCreate, current_user: dict = Depends(get_current_user)):
    supabase = get_supabase()
    doc = {"id": str(uuid.uuid4()), "user_id": current_user["id"], **body.model_dump(),
           "created_at": datetime.utcnow().isoformat()}
    res = supabase.table("timeline_events").insert(doc).execute()
    return res.data[0]


@router.put("/{event_id}")
async def update_event(event_id: str, body: TimelineEventCreate, current_user: dict = Depends(get_current_user)):
    supabase = get_supabase()
    res = supabase.table("timeline_events").update(body.model_dump()).eq("id", event_id).eq("user_id", current_user["id"]).execute()
    return res.data[0] if res.data else {}


@router.delete("/{event_id}")
async def delete_event(event_id: str, current_user: dict = Depends(get_current_user)):
    supabase = get_supabase()
    supabase.table("timeline_events").delete().eq("id", event_id).eq("user_id", current_user["id"]).execute()
    return {"ok": True}
