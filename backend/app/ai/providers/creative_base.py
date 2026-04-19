from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any

from app.models.creative_levers import CreativeLevers
from app.models.perspective_pool import (
    BoldnessLevel,
    GoalPriorityPool,
    NoveltyLevel,
)
from app.models.session import (
    EnlightenmentArtifact,
    InventionArtifact,
    Perspective,
    SparkState,
)


class CreativeProvider(ABC):
    """Swappable GenAI for SPARK MVP workflow (mock or OpenAI later)."""

    @abstractmethod
    async def spark_breakdown(
        self,
        *,
        problem_statement: str,
        title: str | None,
        extra_context: str | None,
    ) -> SparkState:
        raise NotImplementedError

    @abstractmethod
    async def variations_for_elements(
        self,
        *,
        spark: SparkState,
        elements: list[str],
    ) -> dict[str, list[str]]:
        raise NotImplementedError

    @abstractmethod
    async def perspectives_from_part_action_tool_matrix(
        self,
        *,
        problem_statement: str,
        spark: SparkState,
        parts_candidates: list[str],
        actions_candidates: list[str],
        max_perspectives: int,
    ) -> list[Perspective]:
        """Meaningful combinations of parts × actions × creativity tools (GenAI)."""
        raise NotImplementedError

    @abstractmethod
    async def perspectives_with_creative_levers(
        self,
        *,
        problem_statement: str,
        spark: SparkState,
        levers: CreativeLevers,
        num_outputs: int,
    ) -> tuple[list[Perspective], str, list[str]]:
        """CREATIVE LEVER CONTROL: perspectives, recommended line, insight candidates."""
        raise NotImplementedError

    @abstractmethod
    async def generate_perspective_pool(
        self,
        *,
        problem_statement: str,
        spark: SparkState,
        boldness: BoldnessLevel,
        novelty: NoveltyLevel,
        goal_priority: GoalPriorityPool,
        max_perspectives: int,
    ) -> tuple[list[Perspective], str | None, list[str]]:
        """Single GenAI call: all four cognitive tools, balanced pool."""
        raise NotImplementedError

    @abstractmethod
    async def insights_from_perspectives(
        self,
        *,
        spark: SparkState,
        perspectives: list[Perspective],
        problem_statement: str = "",
        theme_groups: list[dict[str, Any]] | None = None,
    ) -> list[dict[str, Any]]:
        """
        Return structured insight drafts: text, why_it_matters, theme_index,
        source_perspective_ids (validated downstream).
        """
        raise NotImplementedError

    @abstractmethod
    async def propose_perspective_changes(
        self,
        *,
        problem_statement: str,
        spark: SparkState,
        perspectives: list[Perspective],
        max_proposals: int,
    ) -> list[dict[str, Any]]:
        """
        Return non-persisted proposal drafts:
        - reposition: {proposal_kind, target_perspective_id, related_perspective_ids, rationale}
        - bridge_card: {proposal_kind, title, description/text, source_tool, spark_element, related_perspective_ids, rationale}
        """
        raise NotImplementedError

    @abstractmethod
    async def invention_from_insights(
        self,
        *,
        spark: SparkState,
        insights: list[str],
    ) -> InventionArtifact:
        raise NotImplementedError

    @abstractmethod
    async def enlightenment_from_work(
        self,
        *,
        spark: SparkState,
        insights: list[str],
        invention: InventionArtifact,
    ) -> EnlightenmentArtifact:
        raise NotImplementedError
