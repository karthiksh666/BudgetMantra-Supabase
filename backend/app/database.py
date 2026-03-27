"""
Supabase client — single shared instance used across all routers.

We use the SERVICE ROLE key on the backend so we can bypass Row Level Security
(RLS is enforced at the DB level; the backend additionally checks ownership via
the JWT user_id on every query).
"""
from supabase import create_client, Client
from app.config import get_settings

_client: Client | None = None


def get_supabase() -> Client:
    global _client
    if _client is None:
        s = get_settings()
        _client = create_client(s.supabase_url, s.supabase_service_role_key)
    return _client


# Convenience alias used in routers
db = get_supabase
