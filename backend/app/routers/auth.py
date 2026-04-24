"""
Auth router — thin wrapper around Supabase Auth.

Sign-up, sign-in, OTP verification, Google OAuth, password reset are all
delegated to Supabase Auth.  The backend just handles profile creation
(writing to the `profiles` table after first sign-up) and returns the
Supabase JWT directly to the client.
"""
import bcrypt
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, EmailStr
from app.database import get_supabase, get_admin_db
from app.auth import get_current_user
from app.config import get_settings

router = APIRouter(prefix="/auth", tags=["auth"])
settings = get_settings()


def _user_has_password(user: dict) -> bool:
    """True iff user has a real (non-placeholder) password.

    Google-signup users get the literal "__google__" sentinel, and phone-OTP
    users get a bcrypt hash of b"__phone_user__" — neither counts as a real
    password. If a Google user later resets their password via the forgot-
    password flow they get a real bcrypt hash and this returns True.
    """
    ph = user.get("password_hash")
    if not ph:
        return False
    if ph == "__google__" or ph.startswith("__"):
        return False
    try:
        if bcrypt.checkpw(b"__phone_user__", ph.encode()):
            return False
    except Exception:
        pass
    return True


# ── Models ──────────────────────────────────────────────────────────────────

class RegisterInput(BaseModel):
    email: EmailStr
    password: str
    name: str

class LoginInput(BaseModel):
    email: EmailStr
    password: str

class OtpVerifyInput(BaseModel):
    email: EmailStr
    token: str = ""     # 6-digit OTP from Supabase email
    otp: str = ""       # alias used by older mobile builds
    type: str = "signup"  # signup | magiclink | email | recovery

    @property
    def resolved_token(self) -> str:
        return self.token or self.otp

class GoogleInput(BaseModel):
    id_token: str       # Google ID token from frontend

class ForgotPasswordInput(BaseModel):
    email: EmailStr

class ResetPasswordInput(BaseModel):
    access_token: str
    new_password: str

class ChangePasswordInput(BaseModel):
    current_password: str
    new_password: str

class ResendOtpInput(BaseModel):
    email: EmailStr

class ProfileUpdate(BaseModel):
    name: str | None = None
    phone: str | None = None
    currency: str | None = None
    monthly_income: float | None = None
    avatar_url: str | None = None


# ── Helpers ──────────────────────────────────────────────────────────────────

def _ensure_profile(user_id: str, name: str = "", email: str = ""):
    """Create a profiles row if it doesn't exist yet (called after sign-up)."""
    db = get_admin_db()
    existing = db.table("profiles").select("id").eq("id", user_id).execute()
    if not existing.data:
        db.table("profiles").insert({
            "id": user_id,
            "name": name,
            "email": email,
            "is_pro": False,
            "is_admin": False,
            "streak": 0,
            "onboarding_complete": False,
        }).execute()


# ── Endpoints ─────────────────────────────────────────────────────────────────

def _get_profile(user_id: str) -> dict:
    """Fetch profile row, returning a minimal dict if not found."""
    try:
        res = get_admin_db().table("profiles").select("*").eq("id", user_id).execute()
        return res.data[0] if res.data else {"id": user_id}
    except Exception:
        return {"id": user_id}


@router.post("/register")
async def register(body: RegisterInput):
    supabase = get_supabase()
    try:
        res = supabase.auth.sign_up({
            "email": body.email,
            "password": body.password,
            "options": {"data": {"name": body.name}},
        })
    except Exception as e:
        raise HTTPException(400, str(e))

    if res.user:
        try:
            _ensure_profile(res.user.id, body.name, body.email)
        except Exception:
            pass

    if res.session:
        profile = _get_profile(res.user.id)
        return {"access_token": res.session.access_token, "user": profile}
    return {"pending": True, "email": body.email, "name": body.name}


@router.post("/login")
async def login(body: LoginInput):
    supabase = get_supabase()
    # Pre-check the profile row: if the account was created via Google or
    # phone-OTP and the user never set a real password, fail fast with a
    # branch-specific message instead of the generic "invalid email/password".
    # A Google user who later reset their password via /auth/forgot-password
    # gets a real bcrypt hash and passes _user_has_password — so this gate
    # does NOT lock them out after a reset.
    try:
        pre = get_admin_db().table("profiles").select("password_hash,auth_provider").eq("email", body.email).execute()
        pre_row = pre.data[0] if pre.data else None
    except Exception:
        pre_row = None
    if pre_row and not _user_has_password(pre_row):
        auth_provider = (pre_row.get("auth_provider") or "").lower()
        if auth_provider == "google":
            raise HTTPException(401, "This account was created with Google sign-in. Use 'Continue with Google', or reset your password first.")
        if auth_provider == "phone":
            raise HTTPException(401, "This account signs in via phone OTP. Use 'Sign in with phone', or set a password from your profile first.")
        raise HTTPException(401, "No password set on this account. Use 'Forgot password' to set one.")

    try:
        res = supabase.auth.sign_in_with_password({
            "email": body.email,
            "password": body.password,
        })
    except Exception as e:
        raise HTTPException(401, "Invalid email or password")

    try:
        _ensure_profile(res.user.id, email=body.email)
    except Exception:
        pass
    profile = _get_profile(res.user.id)
    # Backfill name from Supabase auth metadata if profile has no name
    if not profile.get("name"):
        meta_name = (res.user.user_metadata or {}).get("name") or (res.user.user_metadata or {}).get("full_name") or ""
        if meta_name:
            try:
                get_admin_db().table("profiles").update({"name": meta_name}).eq("id", res.user.id).execute()
                profile["name"] = meta_name
            except Exception:
                pass
    return {
        "access_token": res.session.access_token,
        "refresh_token": res.session.refresh_token,
        "user": profile,
    }


@router.post("/verify-otp")
async def verify_otp(body: OtpVerifyInput):
    """Verify email OTP sent by Supabase after sign-up or magic link."""
    supabase = get_supabase()
    try:
        res = supabase.auth.verify_otp({
            "email": body.email,
            "token": body.resolved_token,
            "type": body.type,
        })
    except Exception as e:
        raise HTTPException(400, "Invalid or expired OTP")

    if res.user:
        meta_name = (res.user.user_metadata or {}).get("name") or (res.user.user_metadata or {}).get("full_name") or ""
        try:
            _ensure_profile(res.user.id, name=meta_name, email=body.email)
        except Exception:
            pass
    profile = _get_profile(res.user.id)
    # Backfill name if still missing
    if not profile.get("name") and res.user:
        meta_name = (res.user.user_metadata or {}).get("name") or (res.user.user_metadata or {}).get("full_name") or ""
        if meta_name:
            try:
                get_admin_db().table("profiles").update({"name": meta_name}).eq("id", res.user.id).execute()
                profile["name"] = meta_name
            except Exception:
                pass
    return {
        "access_token": res.session.access_token,
        "refresh_token": res.session.refresh_token,
        "user": profile,
    }


@router.post("/resend-otp")
async def resend_otp(body: ForgotPasswordInput):
    """Resend signup confirmation OTP."""
    supabase = get_supabase()
    try:
        supabase.auth.resend({"type": "signup", "email": body.email})
    except Exception as e:
        raise HTTPException(400, "Failed to resend OTP")
    return {"message": "OTP resent."}


@router.post("/forgot-password")
async def forgot_password(body: ForgotPasswordInput):
    supabase = get_supabase()
    supabase.auth.reset_password_email(body.email, {"redirect_to": f"{settings.app_url}/reset-password"})
    return {"message": "Password reset email sent."}


@router.post("/reset-password")
async def reset_password(body: ResetPasswordInput):
    supabase = get_supabase()
    try:
        # Set session from the recovery token first
        supabase.auth.set_session(body.access_token, "")
        supabase.auth.update_user({"password": body.new_password})
    except Exception as e:
        raise HTTPException(400, "Failed to reset password")
    return {"message": "Password updated."}


@router.post("/google")
async def google_auth(body: GoogleInput):
    """Exchange Google ID token for a Supabase session."""
    supabase = get_supabase()
    try:
        res = supabase.auth.sign_in_with_id_token({
            "provider": "google",
            "token": body.id_token,
        })
    except Exception as e:
        raise HTTPException(401, "Google authentication failed")

    _ensure_profile(res.user.id, email=res.user.email or "")
    return {
        "access_token": res.session.access_token,
        "refresh_token": res.session.refresh_token,
        "user": res.user,
    }


@router.get("/me")
async def me(current_user: dict = Depends(get_current_user)):
    return current_user


@router.put("/profile")
async def update_profile(body: ProfileUpdate, current_user: dict = Depends(get_current_user)):
    updates = body.model_dump(exclude_none=True)
    if not updates:
        return current_user
    get_admin_db().table("profiles").update(updates).eq("id", current_user["id"]).execute()
    return {**current_user, **updates}


@router.put("/change-password")
async def change_password(body: ChangePasswordInput, current_user: dict = Depends(get_current_user)):
    supabase = get_supabase()
    try:
        # Verify current password by signing in
        supabase.auth.sign_in_with_password({"email": current_user["email"], "password": body.current_password})
        supabase.auth.update_user({"password": body.new_password})
    except Exception:
        raise HTTPException(400, "Current password is incorrect")
    return {"ok": True}


@router.post("/onboarding-complete")
async def onboarding_complete(current_user: dict = Depends(get_current_user)):
    get_admin_db().table("profiles").update({"onboarding_complete": True}).eq("id", current_user["id"]).execute()
    return {"ok": True}


@router.delete("/account")
async def delete_account(current_user: dict = Depends(get_current_user)):
    """Self-service account deletion — removes profile + deletes Supabase auth user."""
    supabase = get_supabase()
    user_id = current_user["id"]
    # All user data tables have ON DELETE CASCADE from profiles, so this cleans everything
    supabase.auth.admin.delete_user(user_id)
    return {"ok": True}


@router.post("/toggle-pro")
async def toggle_pro(current_user: dict = Depends(get_current_user)):
    new_val = not (current_user.get("is_pro") or False)
    res = get_admin_db().table("profiles").update({"is_pro": new_val}).eq("id", current_user["id"]).execute()
    if not res.data:
        raise HTTPException(404, "Profile not found")
    return {"is_pro": new_val}
