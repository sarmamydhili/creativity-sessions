"""User prompt assembly for unified perspective pool generation (one GenAI call)."""

from __future__ import annotations

import json

from app.ai.prompts import templates as prompt_templates
from app.models.perspective_pool import (
    BoldnessLevel,
    GoalPriorityPool,
    NoveltyLevel,
)
from app.models.session import SparkState
from app.services.perspective_pool_allocation import build_allocation_slots


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
    """Single user message: SPARK + levers + subtype catalog + few-shot + allocation JSON."""
    cap = max(1, min(max_perspectives, 32))
    slots = build_allocation_slots(cap)
    allocation_json = json.dumps(slots, ensure_ascii=False, indent=2)
    return prompt_templates.PERSPECTIVE_POOL_USER_TEMPLATE.substitute(
        problem_statement=problem_statement.strip(),
        situation=spark.situation.strip(),
        parts=spark.parts.strip(),
        actions=spark.actions.strip(),
        role=spark.role.strip(),
        key_goal=spark.key_goal.strip(),
        boldness=_boldness_word(boldness),
        novelty=_novelty_word(novelty),
        goal_priority=_goal_words(goal_priority),
        max_perspectives=str(cap),
        subtype_reference=prompt_templates.PERSPECTIVE_POOL_SUBTYPE_REFERENCE,
        few_shot_examples=prompt_templates.PERSPECTIVE_POOL_FEW_SHOT_EXAMPLES_JSON,
        allocation_json=allocation_json,
    )
