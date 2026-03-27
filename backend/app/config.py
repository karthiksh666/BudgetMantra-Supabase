from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    # Supabase
    supabase_url: str
    supabase_anon_key: str
    supabase_service_role_key: str

    # JWT (Supabase signs its own JWTs with the jwt_secret from the project)
    jwt_secret: str
    jwt_algorithm: str = "HS256"

    # AI
    anthropic_api_key: str

    # Google OAuth
    google_client_id: str = ""

    # Firebase (phone auth)
    firebase_project_id: str = ""
    firebase_credentials_json: str = ""   # path to service account JSON

    # App
    app_url: str = "http://localhost:3000"
    admin_secret: str = ""
    cors_origins: str = "http://localhost:3000"

    # Email (SMTP)
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_from: str = ""

    class Config:
        env_file = ".env"
        extra = "ignore"

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",")]


@lru_cache()
def get_settings() -> Settings:
    return Settings()
