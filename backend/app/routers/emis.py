from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, date
import uuid
from app.auth import get_current_user
from app.database import get_supabase

router = APIRouter(prefix="/emis", tags=["emis"])


class EMICreate(BaseModel):
    name: str
    principal: float
    interest_rate: float
    tenure_months: int
    emi_amount: float
    start_date: str
    bank: str = ""
    category: str = "personal"       # personal | home | vehicle | education
    next_due_date: Optional[str] = None


class EMIUpdate(BaseModel):
    name: Optional[str] = None
    emi_amount: Optional[float] = None
    next_due_date: Optional[str] = None
    bank: Optional[str] = None
    status: Optional[str] = None     # active | foreclosed | completed


class EMIPaymentCreate(BaseModel):
    emi_id: str
    amount: float
    paid_date: str
    note: str = ""


@router.get("")
async def list_emis(current_user: dict = Depends(get_current_user)):
    supabase = get_supabase()
    res = supabase.table("emis").select("*, emi_payments(*)").eq("user_id", current_user["id"]).execute()
    return res.data or []


@router.post("", status_code=201)
async def create_emi(body: EMICreate, current_user: dict = Depends(get_current_user)):
    supabase = get_supabase()
    doc = {
        "id": str(uuid.uuid4()),
        "user_id": current_user["id"],
        **body.model_dump(),
        "months_paid": 0,
        "status": "active",
        "created_at": datetime.utcnow().isoformat(),
    }
    res = supabase.table("emis").insert(doc).execute()
    return res.data[0]


@router.put("/{emi_id}")
async def update_emi(emi_id: str, body: EMIUpdate, current_user: dict = Depends(get_current_user)):
    supabase = get_supabase()
    updates = body.model_dump(exclude_none=True)
    res = supabase.table("emis").update(updates).eq("id", emi_id).eq("user_id", current_user["id"]).execute()
    if not res.data:
        raise HTTPException(404, "EMI not found")
    return res.data[0]


@router.delete("/{emi_id}")
async def delete_emi(emi_id: str, current_user: dict = Depends(get_current_user)):
    supabase = get_supabase()
    supabase.table("emis").delete().eq("id", emi_id).eq("user_id", current_user["id"]).execute()
    return {"ok": True}


@router.post("/{emi_id}/payment", status_code=201)
async def record_payment(emi_id: str, body: EMIPaymentCreate, current_user: dict = Depends(get_current_user)):
    supabase = get_supabase()
    # Verify ownership
    emi = supabase.table("emis").select("*").eq("id", emi_id).eq("user_id", current_user["id"]).single().execute()
    if not emi.data:
        raise HTTPException(404, "EMI not found")

    payment = {
        "id": str(uuid.uuid4()),
        "emi_id": emi_id,
        "user_id": current_user["id"],
        "amount": body.amount,
        "paid_date": body.paid_date,
        "note": body.note,
        "created_at": datetime.utcnow().isoformat(),
    }
    supabase.table("emi_payments").insert(payment).execute()

    # Increment months_paid
    new_months = (emi.data.get("months_paid") or 0) + 1
    status = "completed" if new_months >= emi.data["tenure_months"] else "active"
    supabase.table("emis").update({"months_paid": new_months, "status": status}).eq("id", emi_id).execute()

    return payment
