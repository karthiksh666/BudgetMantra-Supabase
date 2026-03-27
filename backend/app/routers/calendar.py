from fastapi import APIRouter, Depends
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, date
import uuid
from app.auth import get_current_user
from app.database import get_supabase

router = APIRouter(tags=["calendar"])


class CalendarEventCreate(BaseModel):
    title: str
    date: str
    type: str = "reminder"
    amount: Optional[float] = None
    description: str = ""
    is_recurring: bool = False


class PeopleEventCreate(BaseModel):
    person_name: str
    event_type: str
    event_date: str
    notes: str = ""


@router.get("/calendar")
async def list_calendar(month: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    supabase = get_supabase()
    q = supabase.table("calendar_events").select("*").eq("user_id", current_user["id"])
    if month:
        q = q.gte("date", f"{month}-01").lt("date", f"{month}-32")
    res = q.order("date").execute()
    return res.data or []


@router.post("/calendar", status_code=201)
async def create_event(body: CalendarEventCreate, current_user: dict = Depends(get_current_user)):
    supabase = get_supabase()
    doc = {"id": str(uuid.uuid4()), "user_id": current_user["id"], **body.model_dump(),
           "created_at": datetime.utcnow().isoformat()}
    res = supabase.table("calendar_events").insert(doc).execute()
    return res.data[0]


@router.delete("/calendar/{event_id}")
async def delete_event(event_id: str, current_user: dict = Depends(get_current_user)):
    supabase = get_supabase()
    supabase.table("calendar_events").delete().eq("id", event_id).eq("user_id", current_user["id"]).execute()
    return {"ok": True}


@router.get("/people-events")
async def list_people_events(current_user: dict = Depends(get_current_user)):
    supabase = get_supabase()
    res = supabase.table("people_events").select("*").eq("user_id", current_user["id"]).order("event_date").execute()
    return res.data or []


@router.post("/people-events", status_code=201)
async def create_people_event(body: PeopleEventCreate, current_user: dict = Depends(get_current_user)):
    supabase = get_supabase()
    doc = {"id": str(uuid.uuid4()), "user_id": current_user["id"], **body.model_dump(),
           "created_at": datetime.utcnow().isoformat()}
    res = supabase.table("people_events").insert(doc).execute()
    return res.data[0]


@router.put("/people-events/{event_id}")
async def update_people_event(event_id: str, body: PeopleEventCreate, current_user: dict = Depends(get_current_user)):
    supabase = get_supabase()
    res = supabase.table("people_events").update(body.model_dump()).eq("id", event_id).eq("user_id", current_user["id"]).execute()
    return res.data[0] if res.data else {}


@router.delete("/people-events/{event_id}")
async def delete_people_event(event_id: str, current_user: dict = Depends(get_current_user)):
    supabase = get_supabase()
    supabase.table("people_events").delete().eq("id", event_id).eq("user_id", current_user["id"]).execute()
    return {"ok": True}
