"""Perspective pool pipeline helpers (post-LLM ranking — not in-model)."""

from __future__ import annotations

from app.models.perspective_pool import PerspectivePoolSettings
from app.models.session import Perspective, SparkState
from app.services.perspective_ranking import (
    RankingContext,
    attach_rank_scores,
    rank_perspectives,
    rebalance_top_k,
)

# How many leading list positions get tool-capped diversity pass (rest stays score-sorted).
_DEFAULT_TOP_K_REBALANCE = 12


def finalize_perspective_pool(
    perspectives: list[Perspective],
    *,
    problem_statement: str,
    spark: SparkState,
    settings: PerspectivePoolSettings,
    rebalance_k: int | None = None,
) -> list[Perspective]:
    """
    After LLM parse: score -> sort desc -> rebalance top-k tool mix -> attach rank_score.

    rank_score is batch-calibrated for display (wider spread, same ordering as raw totals).
    Does not call any model; fully deterministic.
    """
    if not perspectives:
        return []
    ctx = RankingContext(
        problem_statement=problem_statement,
        spark=spark,
        boldness=settings.boldness,
        novelty=settings.novelty,
        goal_priority=settings.goal_priority,
    )
    rows = rank_perspectives(perspectives, ctx)
    k = rebalance_k if rebalance_k is not None else min(_DEFAULT_TOP_K_REBALANCE, len(rows))
    balanced = rebalance_top_k(rows, k)
    return attach_rank_scores(balanced)
