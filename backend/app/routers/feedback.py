from fastapi import APIRouter, Depends
from pydantic import BaseModel
from typing import Optional
from datetime import datetime
import uuid
from app.auth import get_current_user
from app.database import get_supabase

router = APIRouter(prefix="/feedback", tags=["feedback"])


class FeedbackCreate(BaseModel):
    category: str = "general"
    description: Optional[str] = None
    nps_score: Optional[int] = None
    overall_rating: Optional[int] = None
    feature_ratings: dict = {}
    page: Optional[str] = None


@router.post("", status_code=201)
async def submit_feedback(body: FeedbackCreate, current_user: dict = Depends(get_current_user)):
    supabase = get_supabase()
    doc = {
        "id": str(uuid.uuid4()),
        "user_id": current_user["id"],
        "user_name": current_user.get("name", ""),
        "user_email": current_user.get("email", ""),
        "is_pro": current_user.get("is_pro", False),
        **body.model_dump(),
        "status": "new",
        "created_at": datetime.utcnow().isoformat(),
    }
    res = supabase.table("feedback").insert(doc).execute()
    return res.data[0]
