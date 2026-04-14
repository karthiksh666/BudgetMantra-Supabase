from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone
import uuid
from app.auth import get_current_user
from app.database import get_admin_db

router = APIRouter(prefix="/emis", tags=["emis"])


# ── Mobile sends MongoDB-style field names; we accept both conventions ─────────

class EMICreate(BaseModel):
    model_config = {"extra": "ignore"}

    # Mobile (MongoDB) field names
    loan_name: Optional[str] = None
    loan_type: Optional[str] = None
    principal_amount: Optional[float] = None
    monthly_payment: Optional[float] = None
    emi_debit_day: Optional[int] = None

    # Supabase / web field names (also accepted)
    name: Optional[str] = None
    category: Optional[str] = None
    principal: Optional[float] = None
    emi_amount: Optional[float] = None

    # Shared fields
    interest_rate: float = 0
    tenure_months: int = 0
    start_date: str
    bank: str = ""
    next_due_date: Optional[str] = None


class EMIUpdate(BaseModel):
    model_config = {"extra": "ignore"}

    # Accept both name conventions
    loan_name: Optional[str] = None
    name: Optional[str] = None
    loan_type: Optional[str] = None
    category: Optional[str] = None
    monthly_payment: Optional[float] = None
    emi_amount: Optional[float] = None
    next_due_date: Optional[str] = None
    bank: Optional[str] = None
    status: Optional[str] = None


class EMIPaymentCreate(BaseModel):
    model_config = {"extra": "ignore"}

    amount: float
    paid_date: str
    note: str = ""
    # emi_id comes from URL path — not required in body


def _add_emi_aliases(e: dict) -> dict:
    """Add mobile-expected field name aliases to a DB row."""
    e["loan_name"]       = e.get("name") or e.get("loan_name") or ""
    e["loan_type"]       = e.get("category") or e.get("loan_type") or "personal"
    e["principal_amount"]= e.get("principal") or e.get("principal_amount") or 0
    e["monthly_payment"] = e.get("emi_amount") or e.get("monthly_payment") or 0
    e.setdefault("emi_debit_day", 5)
    return e


@router.get("")
async def list_emis(current_user: dict = Depends(get_current_user)):
    supabase = get_admin_db()
    res = supabase.table("emis").select("*, emi_payments(*)").eq("user_id", current_user["id"]).execute()
    return [_add_emi_aliases(e) for e in (res.data or [])]


@router.post("", status_code=201)
async def create_emi(body: EMICreate, current_user: dict = Depends(get_current_user)):
    supabase = get_admin_db()

    name_val      = body.name or body.loan_name or ""
    category_val  = body.category or body.loan_type or "personal"
    principal_val = body.principal or body.principal_amount or 0
    emi_amt_val   = body.emi_amount or body.monthly_payment or 0

    if not name_val:
        raise HTTPException(400, "EMI name is required")

    doc = {
        "id":            str(uuid.uuid4()),
        "user_id":       current_user["id"],
        "name":          name_val,
        "category":      category_val,
        "principal":     principal_val,
        "emi_amount":    emi_amt_val,
        "interest_rate": body.interest_rate,
        "tenure_months": body.tenure_months,
        "start_date":    body.start_date,
        "bank":          body.bank,
        "months_paid":   0,
        "status":        "active",
        "created_at":    datetime.now(timezone.utc).isoformat(),
    }
    if body.next_due_date:
        doc["next_due_date"] = body.next_due_date

    res = supabase.table("emis").insert(doc).execute()
    return _add_emi_aliases(res.data[0])


@router.put("/{emi_id}")
async def update_emi(emi_id: str, body: EMIUpdate, current_user: dict = Depends(get_current_user)):
    supabase = get_admin_db()
    updates: dict = {}

    name_val = body.name or body.loan_name
    if name_val is not None:
        updates["name"] = name_val

    cat_val = body.category or body.loan_type
    if cat_val is not None:
        updates["category"] = cat_val

    emi_amt = body.emi_amount or body.monthly_payment
    if emi_amt is not None:
        updates["emi_amount"] = emi_amt

    for field in ("next_due_date", "bank", "status"):
        val = getattr(body, field)
        if val is not None:
            updates[field] = val

    if not updates:
        raise HTTPException(400, "Nothing to update")

    res = supabase.table("emis").update(updates).eq("id", emi_id).eq("user_id", current_user["id"]).execute()
    if not res.data:
        raise HTTPException(404, "EMI not found")
    return _add_emi_aliases(res.data[0])


@router.delete("/{emi_id}")
async def delete_emi(emi_id: str, current_user: dict = Depends(get_current_user)):
    supabase = get_admin_db()
    supabase.table("emis").delete().eq("id", emi_id).eq("user_id", current_user["id"]).execute()
    return {"ok": True}


@router.post("/{emi_id}/payment", status_code=201)
async def record_payment(emi_id: str, body: EMIPaymentCreate, current_user: dict = Depends(get_current_user)):
    supabase = get_admin_db()
    emi = supabase.table("emis").select("*").eq("id", emi_id).eq("user_id", current_user["id"]).single().execute()
    if not emi.data:
        raise HTTPException(404, "EMI not found")

    payment = {
        "id":         str(uuid.uuid4()),
        "emi_id":     emi_id,
        "user_id":    current_user["id"],
        "amount":     body.amount,
        "paid_date":  body.paid_date,
        "note":       body.note,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    supabase.table("emi_payments").insert(payment).execute()

    new_months = (emi.data.get("months_paid") or 0) + 1
    status = "completed" if new_months >= (emi.data.get("tenure_months") or 0) else "active"
    supabase.table("emis").update({"months_paid": new_months, "status": status}).eq("id", emi_id).execute()

    return payment


@router.post("/{emi_id}/foreclose")
async def foreclose_emi(emi_id: str, current_user: dict = Depends(get_current_user)):
    supabase = get_admin_db()
    emi = supabase.table("emis").select("*").eq("id", emi_id).eq("user_id", current_user["id"]).single().execute()
    if not emi.data:
        raise HTTPException(404, "EMI not found")
    res = supabase.table("emis").update({"status": "foreclosed", "months_paid": emi.data["tenure_months"]}).eq("id", emi_id).execute()
    return _add_emi_aliases(res.data[0])


@router.get("/{emi_id}/preclosure-calculate")
async def preclosure_calculate(emi_id: str, current_user: dict = Depends(get_current_user)):
    supabase = get_admin_db()
    emi = supabase.table("emis").select("*").eq("id", emi_id).eq("user_id", current_user["id"]).single().execute()
    if not emi.data:
        raise HTTPException(404, "EMI not found")
    e = emi.data
    remaining_months = max(0, (e.get("tenure_months") or 0) - (e.get("months_paid") or 0))
    outstanding      = (e.get("emi_amount") or 0) * remaining_months
    penalty          = round(outstanding * 0.02, 2)
    return {
        "remaining_months":       remaining_months,
        "outstanding_principal":  round(outstanding, 2),
        "preclosure_penalty":     penalty,
        "total_payable":          round(outstanding + penalty, 2),
    }
