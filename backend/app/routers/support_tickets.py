from fastapi import APIRouter, Depends
from pydantic import BaseModel
from datetime import datetime, timezone
import uuid
from app.auth import get_current_user
from app.database import get_admin_db

router = APIRouter(tags=["support"])


class TicketCreate(BaseModel):
    subject: str
    description: str
    category: str = "general"
    priority: str = "normal"


@router.post("/support/tickets", status_code=201)
async def create_support_ticket(body: TicketCreate, current_user: dict = Depends(get_current_user)):
    supabase = get_admin_db()
    now = datetime.now(timezone.utc).isoformat()
    doc = {
        "id": str(uuid.uuid4()),
        "user_id": current_user["id"],
        "user_email": current_user.get("email", ""),
        "subject": body.subject,
        "description": body.description,
        "category": body.category,
        "priority": body.priority,
        "status": "open",
        "created_at": now,
        "updated_at": now,
    }
    try:
        res = supabase.table("support_tickets").insert(doc).execute()
        return res.data[0] if res.data else doc
    except Exception:
        return doc


@router.get("/support/tickets")
async def get_my_tickets(current_user: dict = Depends(get_current_user)):
    supabase = get_admin_db()
    try:
        res = supabase.table("support_tickets").select("*").eq("user_id", current_user["id"]).order("created_at", desc=True).execute()
        return res.data or []
    except Exception:
        return []
