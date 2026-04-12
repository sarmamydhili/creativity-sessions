from __future__ import annotations

from abc import ABC, abstractmethod

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
    async def insights_from_perspectives(
        self,
        *,
        spark: SparkState,
        perspectives: list[Perspective],
    ) -> list[str]:
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
