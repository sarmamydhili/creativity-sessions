from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum
from typing import Any, Literal
from uuid import uuid4

from pydantic import AliasChoices, BaseModel, Field, model_validator

from app.models.creative_levers import CreativeLevers
from app.models.perspective_pool import PerspectivePoolSettings


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class SessionStatus(str, Enum):
    active = "active"
    archived = "archived"


class WorkflowStep(str, Enum):
    """Furthest completed step in the creativity journey."""

    session_created = "session_created"
    spark_generated = "spark_generated"
    variations_generated = "variations_generated"
    perspectives_generated = "perspectives_generated"
    insights_generated = "insights_generated"
    invention_generated = "invention_generated"
    enlightenment_generated = "enlightenment_generated"


class CreativityTool(str, Enum):
    analogy = "analogy"
    recategorization = "recategorization"
    combination = "combination"
    association = "association"


class SparkElement(str, Enum):
    situation = "situation"
    parts = "parts"
    actions = "actions"
    role = "role"
    key_goal = "key_goal"


class HistoryEventKind(str, Enum):
    session_created = "session_created"
    session_deleted = "session_deleted"
    spark_generated = "spark_generated"
    spark_edited = "spark_edited"
    problem_edited = "problem_edited"
    variations_generation_run = "variations_generation_run"
    variations_persisted = "variations_persisted"
    variations_generated = "variations_generated"
    perspectives_generated = "perspectives_generated"
    insights_generated = "insights_generated"
    invention_generated = "invention_generated"
    enlightenment_generated = "enlightenment_generated"
    user_note = "user_note"
    perspective_added = "perspective_added"
    perspective_updated = "perspective_updated"
    perspective_deleted = "perspective_deleted"
    iteration_incremented = "iteration_incremented"
    # legacy documents
    stage_transition = "stage_transition"
    spark_generated_legacy = "spark_generated"


class HistoryEntry(BaseModel):
    entry_id: str = Field(default_factory=lambda: str(uuid4()))
    kind: HistoryEventKind
    payload: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime = Field(default_factory=utcnow)


class SparkState(BaseModel):
    situation: str = ""
    parts: str = ""
    actions: str = ""
    role: str = ""
    key_goal: str = ""


class VariationItem(BaseModel):
    """One line in a SPARK element variation list (generated or user-edited)."""

    variation_id: str = Field(default_factory=lambda: str(uuid4()))
    element: str = ""
    text: str = ""
    source: Literal["generated", "user"] = "generated"


class Perspective(BaseModel):
    """Candidate perspective from a creativity tool (not a final solution)."""

    perspective_id: str = Field(default_factory=lambda: str(uuid4()))
    description: str = ""
    text: str = ""
    iteration: int = 1
    source_tool: str = ""
    spark_element: str = ""
    part_ref: str | None = None
    action_ref: str | None = None
    selected: bool = False
    promising: bool = False
    title: str | None = None
    why_interesting: str | None = Field(
        None,
        description="Why the angle is valuable (from pool generation JSON).",
    )
    boldness_level: str | None = None
    novelty_level: str | None = None
    goal_priority_alignment: str | None = None

    @model_validator(mode="after")
    def _sync_text_description(self) -> Perspective:
        if self.description and not self.text:
            self.text = self.description
        elif self.text and not self.description:
            self.description = self.text
        return self


class InsightRecord(BaseModel):
    """Sharper realization derived from perspectives."""

    insight_id: str = Field(default_factory=lambda: str(uuid4()))
    iteration: int = 1
    text: str = ""


class InventionArtifact(BaseModel):
    title: str = ""
    description: str = ""
    benefits: str = ""
    next_steps: str = ""


class EnlightenmentArtifact(BaseModel):
    summary: str = ""
    principles: list[str] = Field(default_factory=list)
    applies_elsewhere: str = ""


# --- API DTOs ---


class SessionCreate(BaseModel):
    problem_statement: str = Field(min_length=1, max_length=10000)
    title: str | None = Field(None, max_length=500)
    owner_id: str | None = Field(
        None,
        validation_alias=AliasChoices("user_id", "owner_id"),
        description="Optional user id for scoping / listing",
    )


class SessionSummary(BaseModel):
    session_id: str
    title: str | None
    problem_statement: str
    status: SessionStatus
    current_step: WorkflowStep
    updated_at: datetime


class SessionDetail(SessionSummary):
    current_iteration: int = 1
    spark_state: SparkState | None = None
    variations: dict[str, list[VariationItem]] = Field(default_factory=dict)
    tool_applications: list[dict[str, Any]] = Field(default_factory=list)
    """Last CREATIVE LEVER CONTROL selections persisted with the session (optional)."""
    last_creative_levers: CreativeLevers | None = None
    """Last unified perspective-pool controls (boldness / novelty / goal priority)."""
    last_perspective_pool: PerspectivePoolSettings | None = None
    last_recommended_perspective: str | None = None
    last_insight_candidates: list[str] = Field(default_factory=list)
    perspectives: list[Perspective] = Field(default_factory=list)
    insights: list[InsightRecord] = Field(default_factory=list)
    invention: InventionArtifact | None = None
    inventions: list[InventionArtifact] = Field(default_factory=list)
    enlightenment: EnlightenmentArtifact | None = None
    history: list[HistoryEntry] = Field(default_factory=list)
    created_at: datetime
    owner_id: str | None = None
    deleted: bool | None = None
    deleted_at: datetime | None = None


class SessionListResponse(BaseModel):
    items: list[SessionSummary]
    total: int


class SessionUpdateRequest(BaseModel):
    """Partial update to session metadata (problem / title)."""

    problem_statement: str | None = Field(None, min_length=1, max_length=10000)
    title: str | None = Field(None, max_length=500)

    @model_validator(mode="after")
    def at_least_one_field(self) -> SessionUpdateRequest:
        if self.problem_statement is None and self.title is None:
            raise ValueError("Provide at least one of problem_statement or title")
        return self


# SPARK
class SparkGenerateRequest(BaseModel):
    extra_context: str | None = None


class SparkGenerateResponse(BaseModel):
    session: SessionDetail
    spark: SparkState


class SparkUpdateRequest(BaseModel):
    situation: str | None = None
    parts: str | None = None
    actions: str | None = None
    role: str | None = None
    key_goal: str | None = None


# Variations
class VariationsGenerateRequest(BaseModel):
    elements: list[str] = Field(
        min_length=1,
        description="One or more of: situation, parts, actions, role, key_goal",
    )
    existing_items: dict[str, list[VariationItem]] | None = Field(
        None,
        description="Current working set from the client (in-memory). Merged with new AI lines.",
    )


class VariationsGenerateResponse(BaseModel):
    """Generation does not persist; use PATCH /variations to save."""

    session: SessionDetail
    new_variations: dict[str, list[str]]
    merged_variations: dict[str, list[VariationItem]]


class VariationsPersistRequest(BaseModel):
    items: dict[str, list[VariationItem]] = Field(
        default_factory=dict,
        description="Full variation set to persist for this session.",
    )


# Perspectives
class PerspectivesGenerateRequest(BaseModel):
    max_perspectives: int = Field(default=30, ge=4, le=32)
    creative_levers: CreativeLevers | None = Field(
        None,
        description="If set, use CREATIVE LEVER CONTROL prompt path instead of legacy matrix.",
    )
    preview_only: bool = Field(
        default=False,
        description="If true, run generation but do not persist perspectives to the session.",
    )


class PerspectivesGenerateResponse(BaseModel):
    session: SessionDetail
    perspectives: list[Perspective]
    recommended_perspective: str | None = None
    insight_candidates: list[str] = Field(default_factory=list)
    creative_levers_applied: CreativeLevers | None = None
    perspective_pool_applied: PerspectivePoolSettings | None = None


class PerspectivesCommitRequest(BaseModel):
    """Replace session perspectives with the committed set (typically user-selected)."""

    perspectives: list[Perspective] = Field(
        min_length=1,
        description="Perspectives to persist; replaces the prior list.",
    )
    creative_levers: CreativeLevers | None = Field(
        None,
        description="Optional legacy creative-lever snapshot to store with the session.",
    )
    perspective_pool: PerspectivePoolSettings | None = Field(
        None,
        description="Optional perspective-pool settings snapshot.",
    )


class PerspectiveSelectionRequest(BaseModel):
    """Empty list clears all selections."""

    perspective_ids: list[str] = Field(default_factory=list)


class PerspectiveSelectionResponse(BaseModel):
    session: SessionDetail


class InsightsGenerateResponse(BaseModel):
    session: SessionDetail
    insights: list[InsightRecord]


class PerspectiveToggleRequest(BaseModel):
    selected: bool = True


class PerspectiveUpdateRequest(BaseModel):
    """Patch fields on a single perspective card."""

    text: str | None = Field(None, max_length=20000)
    description: str | None = Field(None, max_length=20000)
    part_ref: str | None = Field(None, max_length=2000)
    action_ref: str | None = Field(None, max_length=2000)
    selected: bool | None = None
    promising: bool | None = None


class PerspectiveCreateRequest(BaseModel):
    text: str = Field(default="", max_length=20000)


# Invention / Enlightenment
class InventionGenerateResponse(BaseModel):
    session: SessionDetail
    invention: InventionArtifact


class EnlightenmentGenerateResponse(BaseModel):
    session: SessionDetail
    enlightenment: EnlightenmentArtifact


