from typing import Dict

from fastapi import APIRouter, Depends
from typing_extensions import Annotated

from app.core.config import Settings, get_settings
from app.core.creative_ai import creative_ai_mode

router = APIRouter(tags=["health"])


@router.get("/health")
async def health(
    settings: Annotated[Settings, Depends(get_settings)],
) -> Dict[str, str]:
    return {"status": "ok", "creative_ai": creative_ai_mode(settings)}
