from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone
import uuid
from app.auth import get_current_user
from app.database import get_admin_db

router = APIRouter(tags=["notes"])


class NoteBody(BaseModel):
    content: str
    pinned: bool = False
    color: str = "default"


@router.get("/notes")
async def list_notes(q: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    supabase = get_admin_db()
    query = supabase.table("quick_notes").select("*").eq("user_id", current_user["id"])
    if q:
        query = query.ilike("content", f"%{q}%")
    res = query.order("pinned", desc=True).order("updated_at", desc=True).execute()
    return res.data or []


@router.post("/notes", status_code=201)
async def create_note(body: NoteBody, current_user: dict = Depends(get_current_user)):
    supabase = get_admin_db()
    now = datetime.now(timezone.utc).isoformat()
    doc = {
        "id": str(uuid.uuid4()),
        "user_id": current_user["id"],
        "content": body.content,
        "pinned": body.pinned,
        "color": body.color,
        "created_at": now,
        "updated_at": now,
    }
    res = supabase.table("quick_notes").insert(doc).execute()
    return res.data[0] if res.data else doc


@router.patch("/notes/{note_id}")
async def update_note(note_id: str, body: dict, current_user: dict = Depends(get_current_user)):
    supabase = get_admin_db()
    existing = supabase.table("quick_notes").select("id").eq("id", note_id).eq("user_id", current_user["id"]).execute()
    if not existing.data:
        raise HTTPException(status_code=404, detail="Note not found")
    updates = {"updated_at": datetime.now(timezone.utc).isoformat()}
    for field in ("content", "pinned", "color"):
        if field in body:
            updates[field] = body[field]
    res = supabase.table("quick_notes").update(updates).eq("id", note_id).eq("user_id", current_user["id"]).execute()
    return res.data[0] if res.data else updates


@router.delete("/notes/{note_id}")
async def delete_note(note_id: str, current_user: dict = Depends(get_current_user)):
    supabase = get_admin_db()
    supabase.table("quick_notes").delete().eq("id", note_id).eq("user_id", current_user["id"]).execute()
    return {"ok": True}
