"""
Auth utilities — verify Supabase JWTs and expose get_current_user dependency.

Supabase may sign JWTs with HS256 (jwt_secret) or ES256 (ECDSA key pair).
We try HS256 first; if that fails we fall back to fetching the public key
from Supabase's JWKS endpoint and verifying with ES256.
"""
import jwt
import httpx
from fastapi import Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from app.config import get_settings
from app.database import get_supabase

bearer = HTTPBearer()
settings = get_settings()

# Cache JWKS keys so we don't fetch on every request
_jwks_cache: dict = {}


def _get_jwks_key(kid: str) -> str | None:
    if kid in _jwks_cache:
        return _jwks_cache[kid]
    try:
        resp = httpx.get(f"{settings.supabase_url}/auth/v1/.well-known/jwks.json", timeout=5)
        for key in resp.json().get("keys", []):
            _jwks_cache[key["kid"]] = jwt.algorithms.ECAlgorithm.from_jwk(key)
        return _jwks_cache.get(kid)
    except Exception:
        return None


def decode_token(token: str) -> dict:
    # Try HS256 first (older Supabase projects)
    try:
        return jwt.decode(
            token,
            settings.jwt_secret,
            algorithms=["HS256"],
            options={"verify_aud": False},
        )
    except jwt.InvalidTokenError:
        pass

    # Fall back to ES256 via JWKS
    try:
        header = jwt.get_unverified_header(token)
        kid = header.get("kid")
        public_key = _get_jwks_key(kid) if kid else None
        if public_key:
            return jwt.decode(
                token,
                public_key,
                algorithms=["ES256"],
                options={"verify_aud": False},
            )
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except Exception:
        pass

    raise HTTPException(status_code=401, detail="Invalid token")


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer),
) -> dict:
    """
    Returns the full user row from the `profiles` table (our extended user data).
    The Supabase JWT sub = auth.users.id (UUID).
    """
    payload = decode_token(credentials.credentials)
    user_id: str = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token payload")

    supabase = get_supabase()
    result = supabase.table("profiles").select("*").eq("id", user_id).single().execute()
    if not result.data:
        raise HTTPException(status_code=401, detail="User not found")

    return result.data


def require_admin(current_user: dict = Depends(get_current_user)) -> dict:
    if not current_user.get("is_admin"):
        raise HTTPException(status_code=403, detail="Admin access required")
    return current_user
