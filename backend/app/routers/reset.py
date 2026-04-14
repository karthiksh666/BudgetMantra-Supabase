from fastapi import APIRouter, Depends
from app.auth import get_current_user
from app.database import get_admin_db

router = APIRouter(prefix="/reset", tags=["reset"])

TABLES = {
    "transactions":  "transactions",
    "emis":          "emis",
    "savings-goals": "savings_goals",
    "investments":   "investments",
    "gold":          "gold_items",
    "silver":        "silver_items",
    "hand-loans":    "hand_loans",
    "luxury-items":  "luxury_items",
    "children":      "children",
    "gifts":         "gifts",
}


@router.delete("/{resource}", status_code=200)
async def reset_resource(resource: str, current_user: dict = Depends(get_current_user)):
    table = TABLES.get(resource)
    if not table:
        from fastapi import HTTPException
        raise HTTPException(404, f"Unknown resource: {resource}")
    supabase = get_admin_db()
    supabase.table(table).delete().eq("user_id", current_user["id"]).execute()
    return {"ok": True, "cleared": resource}
