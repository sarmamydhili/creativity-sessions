"""How creative generation is resolved (OpenAI vs offline mock)."""

from __future__ import annotations

from typing import Literal

from app.core.config import Settings


def creative_ai_mode(settings: Settings) -> Literal["openai", "mock"]:
    """
    openai: OpenAI Chat Completions will be used (key present, not forced mock).
    mock: Offline templates / heuristics.
    """
    if settings.ai_provider.lower().strip() == "mock":
        return "mock"
    key = settings.openai_api_key.strip().strip('"').strip("'")
    return "openai" if key else "mock"
