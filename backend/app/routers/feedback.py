from fastapi import APIRouter, Depends
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone
import uuid
from app.auth import get_current_user
from app.database import get_admin_db

router = APIRouter(prefix="/feedback", tags=["feedback"])


class FeedbackCreate(BaseModel):
    model_config = {"extra": "ignore"}

    category: str = "general"
    description: Optional[str] = None
    nps_score: Optional[int] = None
    overall_rating: Optional[int] = None
    feature_ratings: dict = {}
    page: Optional[str] = None
    # Bug report fields
    bug_title: Optional[str] = None
    steps_to_reproduce: Optional[str] = None
    severity: Optional[str] = None


@router.post("", status_code=201)
async def submit_feedback(body: FeedbackCreate, current_user: dict = Depends(get_current_user)):
    supabase = get_admin_db()
    doc = {
        "id": str(uuid.uuid4()),
        "user_id": current_user["id"],
        "user_name": current_user.get("name", ""),
        "user_email": current_user.get("email", ""),
        "is_pro": current_user.get("is_pro", False),
        **body.model_dump(),
        "status": "new",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    res = supabase.table("feedback").insert(doc).execute()
    return res.data[0]
