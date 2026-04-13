from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional
from datetime import datetime
import uuid
from app.auth import get_current_user
from app.database import get_supabase

router = APIRouter(tags=["notifications"])


class PushTokenBody(BaseModel):
    token: str
    platform: str = "expo"


class NotificationPrefs(BaseModel):
    weekly_digest: Optional[bool] = None
    monthly_summary: Optional[bool] = None
    emi_reminders: Optional[bool] = None
    goal_alerts: Optional[bool] = None
    budget_alerts: Optional[bool] = None


@router.get("/notifications/prefs")
async def get_notification_prefs(current_user: dict = Depends(get_current_user)):
    supabase = get_supabase()
    try:
        res = supabase.table("notification_prefs").select("*").eq("user_id", current_user["id"]).single().execute()
        return res.data or {}
    except Exception:
        return {"weekly_digest": True, "monthly_summary": True, "emi_reminders": True, "goal_alerts": True, "budget_alerts": True}


@router.put("/notifications/prefs")
async def update_notification_prefs(body: NotificationPrefs, current_user: dict = Depends(get_current_user)):
    supabase = get_supabase()
    updates = body.model_dump(exclude_none=True)
    try:
        existing = supabase.table("notification_prefs").select("id").eq("user_id", current_user["id"]).execute()
        if existing.data:
            res = supabase.table("notification_prefs").update(updates).eq("user_id", current_user["id"]).execute()
        else:
            res = supabase.table("notification_prefs").insert({"id": str(uuid.uuid4()), "user_id": current_user["id"], **updates}).execute()
        return res.data[0] if res.data else updates
    except Exception:
        return updates


@router.put("/notifications/push-token")
async def update_push_token(body: PushTokenBody, current_user: dict = Depends(get_current_user)):
    supabase = get_supabase()
    try:
        supabase.table("profiles").update({"push_token": body.token}).eq("id", current_user["id"]).execute()
    except Exception:
        pass
    return {"ok": True}


@router.get("/notifications/unread")
async def get_unread_notifications(current_user: dict = Depends(get_current_user)):
    supabase = get_supabase()
    try:
        res = supabase.table("notifications").select("*").eq("user_id", current_user["id"]).eq("read", False).order("created_at", desc=True).limit(20).execute()
        return res.data or []
    except Exception:
        return []
