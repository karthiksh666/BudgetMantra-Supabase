from fastapi import APIRouter, HTTPException, Depends, Query
from app.config import get_settings
from app.database import get_supabase

router = APIRouter(prefix="/admin", tags=["admin"])
settings = get_settings()


def _check_secret(admin_secret: str):
    if not settings.admin_secret or admin_secret != settings.admin_secret:
        raise HTTPException(403, "Invalid admin secret")


@router.get("/stats")
async def admin_stats(admin_secret: str = Query("")):
    _check_secret(admin_secret)
    supabase = get_supabase()
    total_users = supabase.table("profiles").select("id", count="exact").execute().count or 0
    pro_users   = supabase.table("profiles").select("id", count="exact").eq("is_pro", True).execute().count or 0
    total_txns  = supabase.table("transactions").select("id", count="exact").execute().count or 0
    total_feedback = supabase.table("feedback").select("id", count="exact").execute().count or 0

    # NPS average
    nps_res = supabase.table("feedback").select("nps_score").execute()
    scores = [r["nps_score"] for r in (nps_res.data or []) if r.get("nps_score") is not None]
    avg_nps = round(sum(scores) / len(scores), 1) if scores else None

    return {
        "total_users": total_users,
        "pro_users": pro_users,
        "pro_pct": round((pro_users / total_users * 100), 1) if total_users else 0,
        "total_transactions": total_txns,
        "total_feedback": total_feedback,
        "avg_nps": avg_nps,
    }


@router.get("/users")
async def admin_users(admin_secret: str = Query(""), skip: int = 0, limit: int = 100):
    _check_secret(admin_secret)
    supabase = get_supabase()
    res = supabase.table("profiles").select("*").order("created_at", desc=True).range(skip, skip + limit - 1).execute()
    total = supabase.table("profiles").select("id", count="exact").execute().count or 0
    return {"items": res.data or [], "total": total}


@router.get("/feedback")
async def admin_feedback(admin_secret: str = Query(""), category: str = "", skip: int = 0, limit: int = 50):
    _check_secret(admin_secret)
    supabase = get_supabase()
    q = supabase.table("feedback").select("*").order("created_at", desc=True)
    if category:
        q = q.eq("category", category)
    res = q.range(skip, skip + limit - 1).execute()
    total = supabase.table("feedback").select("id", count="exact").execute().count or 0
    return {"items": res.data or [], "total": total}


@router.post("/delete-user")
async def admin_delete_user(body: dict):
    _check_secret(body.get("admin_secret", ""))
    email = body.get("email", "").strip().lower()
    if not email:
        raise HTTPException(400, "Email required")
    supabase = get_supabase()
    user = supabase.table("profiles").select("id").eq("email", email).execute()
    if not user.data:
        raise HTTPException(404, "User not found")
    user_id = user.data[0]["id"]
    # Delete from Supabase Auth (cascades to profiles + all tables via FK)
    supabase.auth.admin.delete_user(user_id)
    return {"ok": True, "deleted": email}


@router.post("/make-admin")
async def make_admin(body: dict):
    _check_secret(body.get("admin_secret", ""))
    email = body.get("email", "").strip().lower()
    supabase = get_supabase()
    res = supabase.table("profiles").update({"is_admin": True}).eq("email", email).execute()
    if not res.data:
        raise HTTPException(404, "User not found")
    return {"ok": True}
