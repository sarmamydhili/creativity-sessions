"""
CREATIVE LEVER CONTROL SYSTEM — prompt assembly for levered perspective generation.

Builds user + system text from problem, SPARK state, and levers.
"""

from __future__ import annotations

import random

from app.models.creative_levers import CreativeLevers
from app.models.session import SparkState

MASTER_TEMPLATE = """Problem:
{problem}

Current SPARK State:
Situation: {situation}
Pieces: {pieces}
Actions: {actions}
Role: {role}
Key Goal: {key_goal}

User Lever Selections:
SPARK Target: {spark_target}
Cognitive Tool: {tool}
Depth: {depth}
Divergence: {divergence}
Abstraction: {abstraction}
Domain Lens: {domain_lens}
Goal Priority: {goal_priority}
Novelty: {novelty}

Task: Generate {num_outputs} creative perspective shifts by applying the selected cognitive tool to the selected SPARK target (see SPARK Target above). Respect depth, divergence, abstraction, domain lens, goal priority, and novelty modifiers below.

Perspective quality requirements:
- A perspective is a reframe/angle, not a final solution.
- Do not output inventions, feature lists, implementation plans, or product specs.
- Each perspective must add a distinct line of reasoning (no near-duplicates).
- Prefer perspectives that expose hidden assumptions, tradeoffs/tensions, sequence constraints, or system effects.
- Avoid generic phrases that could fit any problem.
- Use stakeholder lens shift where relevant: vary viewpoints across roles (user, operator, decision owner, risk/safety, etc.) rather than staying in one actor lens.
- Ground stakeholder viewpoints in problem + SPARK context; do not invent random stakeholders.

Output: Respond with JSON only:
{{
  "perspectives": [ {{ "text": "string", "source_tool": "analogy|recategorization|combination|association", "spark_element": "situation|parts|actions|role|key_goal", "part_ref": "optional short string", "action_ref": "optional short string" }} ],
  "recommended_perspective": "string — the single best perspective text from the list and why it fits the goal priority",
  "insight_candidates": [ "string", "string", "string" ]
}}

The perspectives array must have exactly {num_outputs} items. insight_candidates: 2–4 crisp insight lines suggested by these perspectives, preferably including stakeholder tensions/tradeoffs when present.

Before finalizing, silently self-check:
1) Exactly {num_outputs} outputs?
2) Distinct perspectives with no paraphrase duplicates?
3) Perspective-level abstraction (not invention-level)?
4) Clear fit to selected tool + SPARK target?"""

TOOL_TEMPLATES: dict[str, str] = {
    "Analogy": """TOOL — ANALOGY:
Apply ANALOGY thinking. Find analogous patterns from the {domain_lens} domain that resemble the selected SPARK target content. Map those analogies back into the original problem. Generate creative perspectives that preserve structural similarity but create novel ideas.""",
    "Re-categorization": """TOOL — RE-CATEGORIZATION:
Apply RE-CATEGORIZATION. Reinterpret the selected SPARK target using:
- Zoom-In / Zoom-Out abstraction (per Abstraction lever)
- Opposite framing
- Alternative category definitions
Generate new perspectives based on changed categorization.""",
    "Combination": """TOOL — COMBINATION:
Apply COMBINATION thinking. Combine the selected SPARK target with unrelated but potentially useful concepts from the {domain_lens} lens. Generate blended concepts producing new perspectives.""",
    "Association": """TOOL — ASSOCIATION:
Apply ASSOCIATION thinking. Generate loose and remote associations connected to the selected SPARK target. Use indirect conceptual links to generate surprising perspectives.""",
    "Auto-select best": """TOOL — AUTO-SELECT:
Choose the single most appropriate creativity tool (analogy, recategorization, combination, or association) given the problem, SPARK target, and domain lens. State which tool you chose in each perspective's source_tool field. Then apply that tool rigorously.""",
}

DEPTH_RULES: dict[str, str] = {
    "Conservative": """DEPTH — Conservative:
Keep ideas realistic, incremental, and near current norms. Favor small, safe shifts.""",
    "Moderate": """DEPTH — Moderate:
Generate ideas moderately novel but implementable. Balance novelty and feasibility.""",
    "Radical": """DEPTH — Radical:
Generate breakthrough, unconventional, disruptive possibilities. Push beyond obvious answers.""",
}

DIVERGENCE_RULES: dict[str, str] = {
    "Focused": """DIVERGENCE — Focused:
Produce exactly {n} tightly relevant, high-confidence perspectives. Stay close to the SPARK target.""",
    "Balanced": """DIVERGENCE — Balanced:
Produce exactly {n} diverse but relevant perspectives. Mix angles while staying on-problem.""",
    "Exploratory": """DIVERGENCE — Exploratory:
Produce exactly {n} broader, more experimental perspectives. Include some speculative angles.""",
}

ABSTRACTION_RULES: dict[str, str] = {
    "Zoom-In": """ABSTRACTION — Zoom-In:
Emphasize concrete details, specific actors, and immediate mechanisms.""",
    "Normal": """ABSTRACTION — Normal:
Balance concrete detail with mid-level patterns.""",
    "Zoom-Out": """ABSTRACTION — Zoom-Out:
Emphasize systems, context, and higher-level patterns.""",
}

DOMAIN_LENS_HINT: dict[str, str] = {
    "Nature": "Draw metaphors and patterns from biological and natural systems.",
    "Engineering": "Draw patterns from systems, reliability, constraints, and design tradeoffs.",
    "Education": "Draw patterns from learning, pedagogy, scaffolding, and feedback.",
    "Healthcare": "Draw patterns from care pathways, safety, triage, and outcomes.",
    "Random": "Pick a fresh domain lens at random (state it implicitly in the perspectives) and use it for novelty.",
}

GOAL_PRIORITY_RULES: dict[str, str] = {
    "Speed": "Prioritize perspectives that reduce time-to-value or accelerate iteration.",
    "Simplicity": "Prioritize perspectives that reduce complexity and cognitive load.",
    "Cost": "Prioritize perspectives that improve economics or resource efficiency.",
    "Comfort": "Prioritize perspectives that improve human comfort, trust, or ease.",
    "Innovation": "Prioritize perspectives that unlock genuinely new approaches.",
    "Sustainability": "Prioritize perspectives that improve long-term environmental or social sustainability.",
}

NOVELTY_RULES: dict[str, str] = {
    "Practical": """NOVELTY — Practical:
Prioritize feasible, near-term implementable ideas in perspectives and in recommended_perspective.""",
    "Balanced": """NOVELTY — Balanced:
Balance originality and practicality.""",
    "Unexpected": """NOVELTY — Unexpected:
Favor surprising, unconventional ideas while still addressing the problem.""",
}


def divergence_to_count(divergence: str) -> int:
    return {"Focused": 3, "Balanced": 5, "Exploratory": 8}.get(divergence, 5)


def resolve_spark_target_text(spark: SparkState, target: str) -> tuple[str, str]:
    """Returns (human label, spark_element api key)."""
    m: dict[str, tuple[str, str]] = {
        "Situation": ("Situation", "situation"),
        "Pieces": ("Pieces", "parts"),
        "Actions": ("Actions", "actions"),
        "Role": ("Role", "role"),
        "Key Goal": ("Key Goal", "key_goal"),
    }
    if target == "Surprise Me":
        keys = ["Situation", "Pieces", "Actions", "Role", "Key Goal"]
        picked = random.choice(keys)
        return m[picked]
    return m.get(target, ("Pieces", "parts"))


def build_lever_system_prompt() -> str:
    return (
        "You are a creativity facilitator for structured SPARK problem framing. "
        "Follow the user's lever settings exactly. "
        "Generate high-quality perspectives (angles/reframes), not inventions. "
        "Keep outputs specific, non-generic, and mutually distinct. "
        "Output valid JSON only."
    )


def build_lever_user_prompt(
    *,
    problem: str,
    spark: SparkState,
    levers: CreativeLevers,
    num_outputs: int,
) -> str:
    """Assemble MASTER + tool + modifiers + task."""
    resolved_label, _ = resolve_spark_target_text(spark, levers.spark_target)
    tool_key = levers.cognitive_tool
    if tool_key not in TOOL_TEMPLATES:
        tool_key = "Analogy"

    tool_block = TOOL_TEMPLATES[tool_key].format(domain_lens=levers.domain_lens)
    depth_block = DEPTH_RULES[levers.depth]
    div_block = DIVERGENCE_RULES[levers.divergence].format(n=num_outputs)
    abs_block = ABSTRACTION_RULES[levers.abstraction]
    domain_extra = DOMAIN_LENS_HINT.get(levers.domain_lens, "")
    goal_block = GOAL_PRIORITY_RULES.get(levers.goal_priority, "")
    nov_block = NOVELTY_RULES[levers.novelty]

    base = MASTER_TEMPLATE.format(
        problem=problem.strip(),
        situation=spark.situation.strip(),
        pieces=spark.parts.strip(),
        actions=spark.actions.strip(),
        role=spark.role.strip(),
        key_goal=spark.key_goal.strip(),
        spark_target=f"{levers.spark_target} (resolved emphasis: {resolved_label})",
        tool=levers.cognitive_tool,
        depth=levers.depth,
        divergence=levers.divergence,
        abstraction=levers.abstraction,
        domain_lens=levers.domain_lens,
        goal_priority=levers.goal_priority,
        novelty=levers.novelty,
        num_outputs=num_outputs,
    )

    return f"""{base}

{tool_block}

{depth_block}

{div_block}

{abs_block}

DOMAIN LENS — {levers.domain_lens}:
{domain_extra}

GOAL PRIORITY — {levers.goal_priority}:
{goal_block}

{nov_block}
"""
