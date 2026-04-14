from fastapi import APIRouter, Depends
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone
import uuid
from app.auth import get_current_user
from app.database import get_admin_db

router = APIRouter(tags=["gifts"])


class GiftPersonCreate(BaseModel):
    name: str
    relationship: str = ""
    birthday: Optional[str] = None
    anniversary: Optional[str] = None
    notes: str = ""


class LifeEventCreate(BaseModel):
    name: str
    date: str
    type: str = "birthday"
    person_id: Optional[str] = None
    budget: float = 0
    notes: str = ""


class GiftCreate(BaseModel):
    event_id: Optional[str] = None
    person_id: Optional[str] = None
    name: str
    amount: float
    status: str = "planned"
    purchase_date: Optional[str] = None
    notes: str = ""


@router.get("/gift-people")
async def list_people(current_user: dict = Depends(get_current_user)):
    supabase = get_admin_db()
    res = supabase.table("gift_people").select("*").eq("user_id", current_user["id"]).order("name").execute()
    return res.data or []


@router.post("/gift-people", status_code=201)
async def create_person(body: GiftPersonCreate, current_user: dict = Depends(get_current_user)):
    supabase = get_admin_db()
    doc = {"id": str(uuid.uuid4()), "user_id": current_user["id"], **body.model_dump(),
           "created_at": datetime.now(timezone.utc).isoformat()}
    res = supabase.table("gift_people").insert(doc).execute()
    return res.data[0]


@router.put("/gift-people/{person_id}")
async def update_person(person_id: str, body: GiftPersonCreate, current_user: dict = Depends(get_current_user)):
    supabase = get_admin_db()
    res = supabase.table("gift_people").update(body.model_dump()).eq("id", person_id).eq("user_id", current_user["id"]).execute()
    return res.data[0] if res.data else {}


@router.delete("/gift-people/{person_id}", status_code=204)
async def delete_person(person_id: str, current_user: dict = Depends(get_current_user)):
    supabase = get_admin_db()
    supabase.table("gift_people").delete().eq("id", person_id).eq("user_id", current_user["id"]).execute()


@router.get("/events")
async def list_events(current_user: dict = Depends(get_current_user)):
    supabase = get_admin_db()
    res = supabase.table("life_events").select("*").eq("user_id", current_user["id"]).order("date").execute()
    return res.data or []


@router.post("/events", status_code=201)
async def create_event(body: LifeEventCreate, current_user: dict = Depends(get_current_user)):
    supabase = get_admin_db()
    doc = {"id": str(uuid.uuid4()), "user_id": current_user["id"], **body.model_dump(),
           "created_at": datetime.now(timezone.utc).isoformat()}
    res = supabase.table("life_events").insert(doc).execute()
    return res.data[0]


@router.put("/events/{event_id}")
async def update_event(event_id: str, body: LifeEventCreate, current_user: dict = Depends(get_current_user)):
    supabase = get_admin_db()
    res = supabase.table("life_events").update(body.model_dump()).eq("id", event_id).eq("user_id", current_user["id"]).execute()
    return res.data[0] if res.data else {}


@router.delete("/events/{event_id}", status_code=204)
async def delete_event(event_id: str, current_user: dict = Depends(get_current_user)):
    supabase = get_admin_db()
    supabase.table("life_events").delete().eq("id", event_id).eq("user_id", current_user["id"]).execute()


@router.get("/gifts")
async def list_gifts(current_user: dict = Depends(get_current_user)):
    supabase = get_admin_db()
    res = supabase.table("gifts").select("*").eq("user_id", current_user["id"]).order("created_at", desc=True).execute()
    return res.data or []


@router.post("/gifts", status_code=201)
async def create_gift(body: GiftCreate, current_user: dict = Depends(get_current_user)):
    supabase = get_admin_db()
    doc = {"id": str(uuid.uuid4()), "user_id": current_user["id"], **body.model_dump(),
           "created_at": datetime.now(timezone.utc).isoformat()}
    res = supabase.table("gifts").insert(doc).execute()
    return res.data[0]


@router.put("/gifts/{gift_id}")
async def update_gift(gift_id: str, body: GiftCreate, current_user: dict = Depends(get_current_user)):
    supabase = get_admin_db()
    res = supabase.table("gifts").update(body.model_dump()).eq("id", gift_id).eq("user_id", current_user["id"]).execute()
    return res.data[0] if res.data else {}


@router.delete("/gifts/{gift_id}", status_code=204)
async def delete_gift(gift_id: str, current_user: dict = Depends(get_current_user)):
    supabase = get_admin_db()
    supabase.table("gifts").delete().eq("id", gift_id).eq("user_id", current_user["id"]).execute()


@router.get("/events/{event_id}/gifts")
async def gifts_for_event(event_id: str, current_user: dict = Depends(get_current_user)):
    supabase = get_admin_db()
    res = supabase.table("gifts").select("*").eq("event_id", event_id).eq("user_id", current_user["id"]).execute()
    return res.data or []
