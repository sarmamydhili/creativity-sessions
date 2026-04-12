from __future__ import annotations

from typing_extensions import Annotated

from fastapi import APIRouter, Depends, Query, status

from app.api.deps import get_session_service
from app.models.session import (
    SessionCreate,
    SessionDetail,
    SessionListResponse,
    SessionUpdateRequest,
)
from app.services.session_service import SessionService

router = APIRouter(prefix="/api/sessions", tags=["sessions"])


@router.post("", response_model=SessionDetail, status_code=status.HTTP_201_CREATED)
async def create_session(
    body: SessionCreate,
    svc: Annotated[SessionService, Depends(get_session_service)],
) -> SessionDetail:
    return await svc.create_session(body)


@router.get("", response_model=SessionListResponse)
async def list_sessions(
    svc: Annotated[SessionService, Depends(get_session_service)],
    owner_id: str | None = None,
    limit: int = Query(default=50, ge=1, le=100),
    skip: int = Query(default=0, ge=0),
) -> SessionListResponse:
    return await svc.list_sessions(owner_id, limit, skip)


@router.get("/{session_id}", response_model=SessionDetail)
async def get_session(
    session_id: str,
    svc: Annotated[SessionService, Depends(get_session_service)],
) -> SessionDetail:
    return await svc.get_session(session_id)


@router.patch("/{session_id}", response_model=SessionDetail)
async def patch_session(
    session_id: str,
    body: SessionUpdateRequest,
    svc: Annotated[SessionService, Depends(get_session_service)],
) -> SessionDetail:
    return await svc.patch_session(session_id, body)


@router.post("/{session_id}/resume", response_model=SessionDetail)
async def resume_session(
    session_id: str,
    svc: Annotated[SessionService, Depends(get_session_service)],
) -> SessionDetail:
    """Return full session document so the client can restore UI from current_step."""
    return await svc.get_session(session_id)


@router.delete("/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_session(
    session_id: str,
    svc: Annotated[SessionService, Depends(get_session_service)],
) -> None:
    await svc.delete_session(session_id)
