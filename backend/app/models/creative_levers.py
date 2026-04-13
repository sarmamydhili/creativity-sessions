"""User-controlled creative levers for levered perspective generation."""

from __future__ import annotations

from typing import Literal

from pydantic import AliasChoices, BaseModel, ConfigDict, Field

SparkTarget = Literal[
    "Situation",
    "Pieces",
    "Actions",
    "Role",
    "Key Goal",
    "Surprise Me",
]

CognitiveToolLever = Literal[
    "Analogy",
    "Re-categorization",
    "Combination",
    "Association",
    "Auto-select best",
]

DepthLever = Literal["Conservative", "Moderate", "Radical"]

DivergenceLever = Literal["Focused", "Balanced", "Exploratory"]

AbstractionLever = Literal["Zoom-In", "Normal", "Zoom-Out"]

DomainLensLever = Literal[
    "Nature",
    "Engineering",
    "Education",
    "Healthcare",
    "Random",
]

GoalPriorityLever = Literal[
    "Speed",
    "Simplicity",
    "Cost",
    "Comfort",
    "Innovation",
    "Sustainability",
]

NoveltyLever = Literal["Practical", "Balanced", "Unexpected"]


class CreativeLevers(BaseModel):
    """All levers for CREATIVE LEVER CONTROL SYSTEM."""

    model_config = ConfigDict(populate_by_name=True)

    spark_target: SparkTarget = Field(
        default="Pieces",
        description="Which SPARK dimension to emphasize for the cognitive tool.",
    )
    cognitive_tool: CognitiveToolLever = Field(
        default="Analogy",
        validation_alias=AliasChoices("tool", "cognitive_tool"),
        serialization_alias="tool",
        description="Primary creativity tool to apply.",
    )
    depth: DepthLever = Field(default="Moderate")
    divergence: DivergenceLever = Field(default="Balanced")
    abstraction: AbstractionLever = Field(default="Normal")
    domain_lens: DomainLensLever = Field(default="Engineering")
    goal_priority: GoalPriorityLever = Field(default="Innovation")
    novelty: NoveltyLever = Field(default="Balanced")


class LeveredPerspectivesOutput(BaseModel):
    """Structured GenAI output for levered perspective runs."""

    perspectives: list[str] = Field(
        default_factory=list,
        description="Perspective texts (same order as generated cards).",
    )
    recommended_perspective: str = ""
    insight_candidates: list[str] = Field(default_factory=list)
