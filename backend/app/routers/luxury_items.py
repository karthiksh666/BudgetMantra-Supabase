from fastapi import APIRouter, Depends
from pydantic import BaseModel
from typing import Optional
from datetime import datetime
import uuid
from app.auth import get_current_user
from app.database import get_supabase

router = APIRouter(prefix="/luxury-items", tags=["luxury-items"])


class LuxuryItemCreate(BaseModel):
    name: str
    brand: str = ""
    purchase_price: float
    current_value: float = 0
    purchase_date: Optional[str] = None
    category: str = "other"
    condition: str = "good"
    notes: str = ""
    image_url: str = ""


@router.get("")
async def list_items(current_user: dict = Depends(get_current_user)):
    supabase = get_supabase()
    res = supabase.table("luxury_items").select("*").eq("user_id", current_user["id"]).order("purchase_date", desc=True).execute()
    return res.data or []


@router.post("", status_code=201)
async def create_item(body: LuxuryItemCreate, current_user: dict = Depends(get_current_user)):
    supabase = get_supabase()
    doc = {"id": str(uuid.uuid4()), "user_id": current_user["id"], **body.model_dump(),
           "created_at": datetime.utcnow().isoformat()}
    res = supabase.table("luxury_items").insert(doc).execute()
    return res.data[0]


@router.put("/{item_id}")
async def update_item(item_id: str, body: LuxuryItemCreate, current_user: dict = Depends(get_current_user)):
    supabase = get_supabase()
    res = supabase.table("luxury_items").update(body.model_dump()).eq("id", item_id).eq("user_id", current_user["id"]).execute()
    return res.data[0] if res.data else {}


@router.delete("/{item_id}", status_code=204)
async def delete_item(item_id: str, current_user: dict = Depends(get_current_user)):
    supabase = get_supabase()
    supabase.table("luxury_items").delete().eq("id", item_id).eq("user_id", current_user["id"]).execute()
