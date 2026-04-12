from __future__ import annotations

from pathlib import Path

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# `app/core/config.py` → backend/ (always load .env from the API package root, not CWD)
_BACKEND_DIR = Path(__file__).resolve().parent.parent.parent


class Settings(BaseSettings):
    """
    Loads environment variables from `backend/.env` first, then `backend/.env.dev`
    (later overrides earlier). Paths are fixed relative to this package so `uvicorn`
    works whether you start it from `backend/`, repo root, or elsewhere.
    """

    model_config = SettingsConfigDict(
        env_file=(
            str(_BACKEND_DIR / ".env"),
            str(_BACKEND_DIR / ".env.dev"),
        ),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    mongodb_uri: str = "mongodb://127.0.0.1:27017"
    db_name: str = "creative_spark"
    # Include 127.0.0.1 so dev URLs match the browser origin (CORS).
    cors_origins: str = "http://localhost:3000,http://127.0.0.1:3000"

    # Creative AI: use OpenAI Chat Completions when OPENAI_API_KEY is set.
    # Set AI_PROVIDER=mock to force offline templates (no LLM) even if a key exists.
    ai_provider: str = "openai"
    openai_api_key: str = ""
    openai_model: str = "gpt-4o-mini"

    anthropic_api_key: str = ""
    deepseek_api_key: str = ""
    gemini_api_key: str = ""
    langchain_api_key: str = ""
    xai_api_key: str = ""

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @field_validator("openai_api_key", mode="before")
    @classmethod
    def strip_openai_key(cls, v: object) -> str:
        if v is None:
            return ""
        return str(v).strip().strip('"').strip("'")


def get_settings() -> Settings:
    return Settings()
