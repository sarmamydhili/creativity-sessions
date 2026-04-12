from __future__ import annotations

from typing_extensions import Annotated

from fastapi import APIRouter, Body, Depends

from app.api.deps import get_creative_workflow_service
from app.models.session import (
    EnlightenmentGenerateResponse,
    InsightsGenerateResponse,
    InventionGenerateResponse,
    PerspectiveCreateRequest,
    PerspectivesGenerateRequest,
    PerspectivesGenerateResponse,
    PerspectiveSelectionRequest,
    PerspectiveSelectionResponse,
    PerspectiveToggleRequest,
    PerspectiveUpdateRequest,
    SessionDetail,
    SparkGenerateRequest,
    SparkGenerateResponse,
    SparkUpdateRequest,
    VariationsGenerateRequest,
    VariationsGenerateResponse,
    VariationsPersistRequest,
)
from app.services.creative_workflow_service import CreativeWorkflowService

router = APIRouter(prefix="/api/sessions", tags=["workflow"])


@router.post("/{session_id}/spark", response_model=SparkGenerateResponse)
async def spark_generate(
    session_id: str,
    body: SparkGenerateRequest,
    wf: Annotated[CreativeWorkflowService, Depends(get_creative_workflow_service)],
) -> SparkGenerateResponse:
    return await wf.generate_spark(session_id, body.extra_context)


@router.patch("/{session_id}/spark", response_model=SessionDetail)
async def spark_update(
    session_id: str,
    body: SparkUpdateRequest,
    wf: Annotated[CreativeWorkflowService, Depends(get_creative_workflow_service)],
) -> SessionDetail:
    return await wf.update_spark(session_id, body)


@router.post("/{session_id}/variations", response_model=VariationsGenerateResponse)
async def variations_generate(
    session_id: str,
    body: VariationsGenerateRequest,
    wf: Annotated[CreativeWorkflowService, Depends(get_creative_workflow_service)],
) -> VariationsGenerateResponse:
    return await wf.generate_variations(
        session_id, body.elements, body.existing_items
    )


@router.patch("/{session_id}/variations", response_model=SessionDetail)
async def variations_persist(
    session_id: str,
    body: VariationsPersistRequest,
    wf: Annotated[CreativeWorkflowService, Depends(get_creative_workflow_service)],
) -> SessionDetail:
    return await wf.persist_variations(session_id, body.items)


@router.post("/{session_id}/perspectives/manual", response_model=SessionDetail)
async def perspective_add_manual(
    session_id: str,
    body: PerspectiveCreateRequest,
    wf: Annotated[CreativeWorkflowService, Depends(get_creative_workflow_service)],
) -> SessionDetail:
    return await wf.add_perspective(session_id, body)


@router.post("/{session_id}/perspectives", response_model=PerspectivesGenerateResponse)
async def perspectives_generate(
    session_id: str,
    wf: Annotated[CreativeWorkflowService, Depends(get_creative_workflow_service)],
    body: PerspectivesGenerateRequest | None = Body(default=None),
) -> PerspectivesGenerateResponse:
    req = body or PerspectivesGenerateRequest()
    return await wf.generate_perspectives(session_id, req.max_perspectives)


@router.patch(
    "/{session_id}/perspectives/{perspective_id}",
    response_model=SessionDetail,
)
async def perspective_update(
    session_id: str,
    perspective_id: str,
    body: PerspectiveUpdateRequest,
    wf: Annotated[CreativeWorkflowService, Depends(get_creative_workflow_service)],
) -> SessionDetail:
    return await wf.update_perspective(session_id, perspective_id, body)


@router.delete(
    "/{session_id}/perspectives/{perspective_id}",
    response_model=SessionDetail,
)
async def perspective_delete(
    session_id: str,
    perspective_id: str,
    wf: Annotated[CreativeWorkflowService, Depends(get_creative_workflow_service)],
) -> SessionDetail:
    return await wf.delete_perspective(session_id, perspective_id)


@router.patch(
    "/{session_id}/perspectives/{perspective_id}/selection",
    response_model=SessionDetail,
)
async def perspective_toggle_selection(
    session_id: str,
    perspective_id: str,
    body: PerspectiveToggleRequest,
    wf: Annotated[CreativeWorkflowService, Depends(get_creative_workflow_service)],
) -> SessionDetail:
    return await wf.toggle_perspective_selection(
        session_id, perspective_id, body.selected
    )


@router.post("/{session_id}/perspectives/select", response_model=PerspectiveSelectionResponse)
async def perspectives_select(
    session_id: str,
    body: PerspectiveSelectionRequest,
    wf: Annotated[CreativeWorkflowService, Depends(get_creative_workflow_service)],
) -> PerspectiveSelectionResponse:
    return await wf.select_perspectives(session_id, body.perspective_ids)


@router.post("/{session_id}/insights", response_model=InsightsGenerateResponse)
async def insights_generate(
    session_id: str,
    wf: Annotated[CreativeWorkflowService, Depends(get_creative_workflow_service)],
) -> InsightsGenerateResponse:
    return await wf.generate_insights(session_id)


@router.post("/{session_id}/inventions", response_model=InventionGenerateResponse)
async def invention_generate(
    session_id: str,
    wf: Annotated[CreativeWorkflowService, Depends(get_creative_workflow_service)],
) -> InventionGenerateResponse:
    return await wf.generate_invention(session_id)


@router.post("/{session_id}/enlightenment", response_model=EnlightenmentGenerateResponse)
async def enlightenment_generate(
    session_id: str,
    wf: Annotated[CreativeWorkflowService, Depends(get_creative_workflow_service)],
) -> EnlightenmentGenerateResponse:
    return await wf.generate_enlightenment(session_id)
