from fastapi import APIRouter, Depends
from pydantic import BaseModel
from datetime import datetime, timezone
import uuid
from app.auth import get_current_user
from app.database import get_admin_db

router = APIRouter(prefix="/piggy-bank", tags=["piggy-bank"])


class PiggyBankUpdate(BaseModel):
    balance: float


@router.get("")
async def get_piggy_bank(current_user: dict = Depends(get_current_user)):
    supabase = get_admin_db()
    res = supabase.table("piggy_bank").select("*").eq("user_id", current_user["id"]).execute()
    if res.data:
        return res.data[0]
    return {"user_id": current_user["id"], "balance": 0}


@router.put("")
async def update_piggy_bank(body: PiggyBankUpdate, current_user: dict = Depends(get_current_user)):
    supabase = get_admin_db()
    existing = supabase.table("piggy_bank").select("id").eq("user_id", current_user["id"]).execute()
    if existing.data:
        res = supabase.table("piggy_bank").update({"balance": body.balance, "updated_at": datetime.now(timezone.utc).isoformat()}).eq("user_id", current_user["id"]).execute()
    else:
        res = supabase.table("piggy_bank").insert({
            "id": str(uuid.uuid4()), "user_id": current_user["id"],
            "balance": body.balance, "updated_at": datetime.now(timezone.utc).isoformat()
        }).execute()
    return res.data[0]
