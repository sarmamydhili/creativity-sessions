"""Unified perspective pool generation — boldness, novelty, goal priority only."""

from __future__ import annotations

from enum import Enum

from pydantic import BaseModel, Field


class BoldnessLevel(str, Enum):
    low = "low"
    medium = "medium"
    high = "high"


class NoveltyLevel(str, Enum):
    low = "low"
    medium = "medium"
    high = "high"


class GoalPriorityPool(str, Enum):
    simplicity = "simplicity"
    cost_efficiency = "cost_efficiency"
    comfort = "comfort"
    innovation = "innovation"
    sustainability = "sustainability"
    speed = "speed"
    reliability = "reliability"


class PerspectivePoolSettings(BaseModel):
    """User-facing controls for a single GenAI perspective-pool run."""

    boldness: BoldnessLevel = Field(default=BoldnessLevel.medium)
    novelty: NoveltyLevel = Field(default=NoveltyLevel.medium)
    goal_priority: GoalPriorityPool = Field(default=GoalPriorityPool.innovation)


class PerspectivePoolGenerateRequest(BaseModel):
    max_perspectives: int = Field(default=30, ge=4, le=32)
    preview_only: bool = Field(
        default=False,
        description="If true, run generation but do not persist perspectives to the session.",
    )
    boldness: BoldnessLevel
    novelty: NoveltyLevel
    goal_priority: GoalPriorityPool
