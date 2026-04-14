from fastapi import APIRouter, Depends
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone
import uuid
from app.auth import get_current_user
from app.database import get_admin_db

router = APIRouter(prefix="/nominees", tags=["nominees"])


class NomineeCreate(BaseModel):
    name: str
    relationship: str
    phone: Optional[str] = None
    email: Optional[str] = None


@router.get("")
async def list_nominees(current_user: dict = Depends(get_current_user)):
    supabase = get_admin_db()
    res = supabase.table("nominees").select("*").eq("user_id", current_user["id"]).execute()
    return res.data or []


@router.post("", status_code=201)
async def create_nominee(body: NomineeCreate, current_user: dict = Depends(get_current_user)):
    supabase = get_admin_db()
    doc = {"id": str(uuid.uuid4()), "user_id": current_user["id"], **body.model_dump(),
           "is_verified": False, "created_at": datetime.now(timezone.utc).isoformat()}
    res = supabase.table("nominees").insert(doc).execute()
    return res.data[0]


@router.delete("/{nominee_id}", status_code=204)
async def delete_nominee(nominee_id: str, current_user: dict = Depends(get_current_user)):
    supabase = get_admin_db()
    supabase.table("nominees").delete().eq("id", nominee_id).eq("user_id", current_user["id"]).execute()
