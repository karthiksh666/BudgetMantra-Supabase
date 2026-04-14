"""
Supabase client — single shared instance used across all routers.

We use the SERVICE ROLE key on the backend so we can bypass Row Level Security
(RLS is enforced at the DB level; the backend additionally checks ownership via
the JWT user_id on every query).
"""
from supabase import create_client, Client
from app.config import get_settings

_client: Client | None = None
_admin_client: Client | None = None


def get_supabase() -> Client:
    """Auth client — used for sign_up / sign_in_with_password etc.
    NOTE: supabase-py mutates this client's session after auth calls,
    so NEVER use it for database table operations after an auth call."""
    global _client
    if _client is None:
        s = get_settings()
        _client = create_client(s.supabase_url, s.supabase_service_role_key)
    return _client


def get_admin_db() -> Client:
    """Separate service-role client used exclusively for DB table operations.
    Kept separate from the auth client to avoid session contamination."""
    global _admin_client
    if _admin_client is None:
        s = get_settings()
        _admin_client = create_client(s.supabase_url, s.supabase_service_role_key)
    return _admin_client


# Convenience alias used in routers
db = get_supabase
