"""User prompt assembly for unified perspective pool generation (one GenAI call)."""

from __future__ import annotations

from app.models.perspective_pool import (
    BoldnessLevel,
    GoalPriorityPool,
    NoveltyLevel,
)
from app.models.session import SparkState


def _boldness_word(b: BoldnessLevel) -> str:
    return b.value


def _novelty_word(n: NoveltyLevel) -> str:
    return n.value


def _goal_words(g: GoalPriorityPool) -> str:
    return g.value.replace("_", " ")


def build_perspective_pool_user_prompt(
    *,
    problem_statement: str,
    spark: SparkState,
    boldness: BoldnessLevel,
    novelty: NoveltyLevel,
    goal_priority: GoalPriorityPool,
    max_perspectives: int,
) -> str:
    """Exact structure requested for the LLM user message."""
    per_tool = max_perspectives // 4
    remainder = max_perspectives % 4
    dist_note = (
        f"Target exactly {max_perspectives} perspectives total. "
        f"Use approximately {per_tool} per tool; if remainder is {remainder}, "
        "add one extra each to the first tools in order: analogy, recategorization, combination, association."
    )
    return f"""Problem Statement:
{problem_statement.strip()}

SPARK State:
Situation: {spark.situation.strip()}
Parts: {spark.parts.strip()}
Actions: {spark.actions.strip()}
Role: {spark.role.strip()}
Key Goal: {spark.key_goal.strip()}

Boldness:
{_boldness_word(boldness)}

Novelty:
{_novelty_word(novelty)}

Goal Priority:
{_goal_words(goal_priority)}

Maximum Perspectives:
{max_perspectives}

Instructions:
Generate a balanced pool of perspectives across all four cognitive tools.

Requirements:
- distribute perspectives across analogy, re-categorization, combination, and association
- each perspective must clearly reflect its tool
- avoid duplicates
- make outputs distinct and useful
- align all ideas to boldness, novelty, and goal priority
- {dist_note}

Return valid JSON only with key "perspectives" as specified in the system message."""
