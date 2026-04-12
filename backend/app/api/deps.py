from __future__ import annotations

import logging
from typing_extensions import Annotated

from fastapi import Depends

from app.ai.providers.creative_base import CreativeProvider
from app.ai.providers.creative_mock import CreativeMockProvider
from app.ai.providers.openai_creative import OpenAICreativeProvider
from app.core.config import Settings, get_settings
from app.core.creative_ai import creative_ai_mode
from app.db.mongo import get_database
from app.repositories.session_repository import SessionRepository
from app.services.creative_workflow_service import CreativeWorkflowService
from app.services.session_service import SessionService

logger = logging.getLogger(__name__)

# Avoid spamming logs on every request when the API key is missing.
_logged_creative_fallback: bool = False


def get_session_repository() -> SessionRepository:
    return SessionRepository(get_database())


def get_session_service(
    repo: Annotated[SessionRepository, Depends(get_session_repository)],
) -> SessionService:
    return SessionService(repo)


def get_creative_provider(
    settings: Annotated[Settings, Depends(get_settings)],
) -> CreativeProvider:
    """
    Prefer the OpenAI LLM whenever OPENAI_API_KEY is set.

    Use AI_PROVIDER=mock to force offline template generation (tests / no key).
    """
    global _logged_creative_fallback
    key = settings.openai_api_key.strip().strip('"').strip("'")

    if creative_ai_mode(settings) == "openai":
        return OpenAICreativeProvider(api_key=key, model=settings.openai_model)

    if settings.ai_provider.lower().strip() != "mock":
        if not _logged_creative_fallback:
            logger.warning(
                "Creative AI: OPENAI_API_KEY is empty; using mock provider. "
                "Set OPENAI_API_KEY in backend/.env or .env.dev for LLM-generated SPARK and workflow steps."
            )
            _logged_creative_fallback = True
    return CreativeMockProvider()


def get_creative_workflow_service(
    sessions: Annotated[SessionService, Depends(get_session_service)],
    repo: Annotated[SessionRepository, Depends(get_session_repository)],
    provider: Annotated[CreativeProvider, Depends(get_creative_provider)],
) -> CreativeWorkflowService:
    return CreativeWorkflowService(sessions, repo, provider)


SettingsDep = Annotated[Settings, Depends(get_settings)]
