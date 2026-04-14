from __future__ import annotations

import itertools
import re
from uuid import uuid4

from app.ai.providers.creative_base import CreativeProvider
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
from app.services.creative_lever_prompt_builder import resolve_spark_target_text


def _clip(text: str, max_len: int) -> str:
    s = (text or "").strip()
    if len(s) <= max_len:
        return s
    return s[: max_len - 1].rstrip() + "…"


_STOP_WORDS = frozenset(
    """
    the and for are but not you all can her was one our out day get has him his how its may new
    now old see two way who boy did let put say she too use help more stay with this that from
    they have been were said each which their time will about when what make like just into over
    such take than only some come also back after well work first even many must these most made
    does could should would might any both here there then much very being need want able ways
    idea ideas using onto any into there then them their those these than that this with from
    while although because though
    """.split()
)

# Adjectives/adverbs / junk that are not noun “parts”
_NOISE_TOKENS = frozenset(
    """
    effectively usually really very simply quickly better worse hydrated hydrate
    """.split()
)

# Short tokens allowed as nouns (else require min length)
_SHORT_NOUN_OK = frozenset({"jog", "app", "api", "gym", "ux", "ui", "iot"})


def _keywords(text: str, max_n: int = 10) -> list[str]:
    """Loose tokens from prose; filtered again before use in parts."""
    words = re.findall(r"[a-zA-Z][a-zA-Z0-9\-']+", (text or "").lower())
    out: list[str] = []
    seen: set[str] = set()
    for w in words:
        if w in _STOP_WORDS or w in _NOISE_TOKENS:
            continue
        if len(w) < 3:
            continue
        if len(w) < 4 and w not in _SHORT_NOUN_OK:
            continue
        if w not in seen:
            seen.add(w)
            out.append(w)
        if len(out) >= max_n:
            break
    return out


def _build_parts_noun_lines(parts_extra: str, kw: list[str]) -> str:
    """
    Parts = one noun/entity per line. Domain list first, then vetted keywords.
    """
    lines: list[str] = []
    seen: set[str] = set()

    for segment in parts_extra.split(";"):
        seg = segment.strip()
        if not seg:
            continue
        key = seg.lower()
        if key not in seen:
            seen.add(key)
            lines.append(seg[0].upper() + seg[1:] if seg else seg)

    for w in kw:
        if w in _NOISE_TOKENS or w in _STOP_WORDS:
            continue
        if len(w) < 4 and w not in _SHORT_NOUN_OK:
            continue
        if w.endswith("ly") and len(w) > 5:
            continue
        key = w.lower()
        if key in seen:
            continue
        seen.add(key)
        lines.append(w[0].upper() + w[1:] if w else w)
        if len(lines) >= 14:
            break

    return "\n".join(lines) if lines else "Stakeholders\nConstraints\nTouchpoints"


def _domain_spark(ps: str, title: str | None) -> tuple[str, str, str, str, str]:
    """
    Returns (situation_body, parts_extra, actions, role, goal_lead) tailored by simple keyword routing.
    """
    pl = f"{ps} {title or ''}".lower()

    if any(w in pl for w in ("jog", "runner", "running", "marathon", "hydrat", "sweat")):
        return (
            "During runs and workouts, fluid loss and heat add up fast; carrying water, timing drinks, "
            "and remembering to hydrate compete with pace, comfort, and route choices.",
            "routes; weather and heat; refill points; bottles and belts; reminders; distance and pace; habits",
            "Log intake around effort; map routes with water stops; pick lightweight gear; time drinks; "
            "test on long runs; adjust for temperature; review weekly adherence.",
            "Runners; coaches; race organizers; hydration apps; gear brands; parks and trail operators.",
            "Reliable hydration during activity without extra cognitive load or skipped drinks",
        )
    if any(w in pl for w in ("kitchen", "waste", "food", "compost", "recycl", "office")):
        return (
            "Shared spaces mix habits, policies, and convenience; small friction changes what gets thrown away "
            "or reused.",
            "bins and signage; procurement; cleaning cadence; peer norms; catering; storage; measurement",
            "Audit what is wasted; redesign nudges; pilot new bins; train teams; track diversion; iterate messaging.",
            "Employees; facilities; vendors; sustainability lead; leadership sponsors; janitorial partners.",
            "Measurable reduction in waste or higher diversion with a practical definition of success",
        )
    if any(w in pl for w in ("learn", "student", "school", "course", "teach", "education")):
        return (
            "Learners balance attention, motivation, and outside constraints; the useful moment to intervene "
            "is often brief and easy to miss.",
            "curriculum; assessments; cohort; instructors; tools; office hours; distractions; incentives",
            "Diagnose blockers; scaffold practice; give timely feedback; prototype lessons; measure outcomes; iterate.",
            "Learners; instructors; instructional designers; admins; peers; families when relevant.",
            "A clear lift in learning or completion with evidence, not just intent",
        )
    if any(w in pl for w in ("health", "patient", "clinic", "doctor", "care", "hospital")):
        return (
            "Care journeys combine trust, timing, and information load; errors often come from handoffs or unclear next steps.",
            "patients; clinicians; scheduling; records; devices; payers; caregivers; environments",
            "Triage needs; align on goals; coordinate handoffs; educate; monitor; close loops; measure safety and satisfaction.",
            "Patient; clinician; care team; operations; payer; caregiver; specialist.",
            "Better outcomes or experience with a safe, realistic path to “done”",
        )
    if any(w in pl for w in ("app", "software", "saas", "product", "ux", "ui", "user")):
        return (
            "Digital products compete with habit and alternatives; adoption hinges on clarity, speed, and trust in the first sessions.",
            "users and segments; jobs-to-be-done; flows; data; integrations; policies; metrics; support",
            "Research; prototype; usability test; ship thin slices; measure retention; iterate on friction points.",
            "End user; product; design; engineering; legal/compliance; success; leadership.",
            "A measurable improvement in the outcome users hire the product for",
        )
    return (
        "Stakeholders juggle habits, incentives, and constraints; friction in the journey often blocks a better outcome.",
        "touchpoints; tools and surfaces; data; policies; environment; incentives; failure and success signals",
        "Clarify the need; map journeys; prototype; pilot; measure adoption; iterate; communicate tradeoffs.",
        "People with the need; builders; sponsors; approvers; partners; anyone who blocks or enables change.",
        "A concrete, measurable improvement people would notice within real time and cost limits",
    )


def _mock_spark_from_problem(
    problem_statement: str,
    title: str | None,
    extra_context: str | None,
) -> SparkState:
    """
    Offline SPARK: five distinct fields, problem-tuned (not one paragraph pasted everywhere).
    For true LLM output, set OPENAI_API_KEY and AI_PROVIDER=openai.
    """
    ps = (problem_statement or "").strip() or "the challenge you are exploring."
    extra = (extra_context or "").strip()
    hook = _clip(ps, 120)
    kw = _keywords(ps + " " + (title or ""))
    dom_sit, parts_extra, dom_act, dom_role, goal_lead = _domain_spark(ps, title)

    situation_parts: list[str] = []
    if title and title.strip():
        situation_parts.append(f"Focus: «{title.strip()}».")
    situation_parts.append(dom_sit)
    situation_parts.append(f"The question on the table: «{hook}».")
    if extra:
        situation_parts.append(f"Additional context: {_clip(extra, 220)}")
    situation = " ".join(situation_parts)

    parts = _build_parts_noun_lines(parts_extra, kw)

    actions = dom_act
    role = dom_role
    key_goal = (
        f"{goal_lead}, tied to «{hook}», with a short checklist for “done” that fits real constraints."
    )

    return SparkState(
        situation=situation,
        parts=parts,
        actions=actions,
        role=role,
        key_goal=key_goal,
    )


def _split_sentences(text: str) -> list[str]:
    if not text.strip():
        return []
    parts = re.split(r"(?<=[.!?])\s+|\n+", text.strip())
    return [p.strip() for p in parts if p.strip()]


def _variations_from_spark_field(text: str, *, max_lines: int = 4) -> list[str]:
    """Derive short alternative lines from SPARK text—content only, no labels."""
    t = (text or "").strip()
    if not t:
        return [
            "Narrow the scope to one stakeholder or one constraint.",
            "Widen the frame to include adjacent systems or incentives.",
        ]
    sents = _split_sentences(t)
    if len(sents) >= 2:
        return [_clip(s, 220) for s in sents[:max_lines]]
    chunks = [c.strip() for c in re.split(r"[,;]\s*", t) if c.strip()]
    if len(chunks) >= 2:
        return [_clip(c, 220) for c in chunks[:max_lines]]
    half = max(len(t) // 2, 40)
    return [_clip(t[: half + 30], 200), _clip(t[half:], 200)][:max_lines]


class CreativeMockProvider(CreativeProvider):
    """Offline provider: SPARK and follow-on steps derive from the session problem text."""

    async def spark_breakdown(
        self,
        *,
        problem_statement: str,
        title: str | None,
        extra_context: str | None,
    ) -> SparkState:
        return _mock_spark_from_problem(problem_statement, title, extra_context)

    async def variations_for_elements(
        self,
        *,
        spark: SparkState,
        elements: list[str],
    ) -> dict[str, list[str]]:
        field_map = {
            "situation": spark.situation,
            "parts": spark.parts,
            "actions": spark.actions,
            "role": spark.role,
            "key_goal": spark.key_goal,
        }
        out: dict[str, list[str]] = {}
        for el in elements:
            key = el.lower().strip()
            if key in field_map:
                out[key] = _variations_from_spark_field(field_map[key], max_lines=6)
        return out

    async def perspectives_from_part_action_tool_matrix(
        self,
        *,
        problem_statement: str,
        spark: SparkState,
        parts_candidates: list[str],
        actions_candidates: list[str],
        max_perspectives: int,
    ) -> list[Perspective]:
        ps = (problem_statement or "").strip()
        tools = ["analogy", "recategorization", "combination", "association"]
        pc = parts_candidates[:6] or [_clip(ps, 100) or "the core need"]
        ac = actions_candidates[:6] or ["make progress", "reduce friction"]
        pairs = list(itertools.islice(itertools.product(pc, ac), max_perspectives))
        out: list[Perspective] = []
        for idx, (part, act) in enumerate(pairs):
            tool = tools[idx % len(tools)]
            if tool == "analogy":
                desc = (
                    f"[{tool}] Pair “{_clip(part, 100)}” with “{_clip(act, 100)}” "
                    "as you would align two systems that must stay in sync."
                )
            elif tool == "recategorization":
                desc = (
                    f"[{tool}] Reframe “{_clip(part, 80)}” and “{_clip(act, 80)}” "
                    "as parts of one workflow instead of separate concerns."
                )
            elif tool == "combination":
                desc = (
                    f"[{tool}] Combine “{_clip(part, 90)}” and “{_clip(act, 90)}” into "
                    "one coherent experience or intervention."
                )
            else:
                desc = (
                    f"[{tool}] Loosely connect “{_clip(part, 90)}” with “{_clip(act, 90)}” "
                    f"to spark a new angle on: {_clip(ps, 120)}"
                )
            out.append(
                Perspective(
                    perspective_id=str(uuid4()),
                    description=desc,
                    text=desc,
                    source_tool=tool,
                    spark_element="parts+actions",
                    part_ref=part[:120],
                    action_ref=act[:120],
                )
            )
        return out

    async def perspectives_with_creative_levers(
        self,
        *,
        problem_statement: str,
        spark: SparkState,
        levers: CreativeLevers,
        num_outputs: int,
    ) -> tuple[list[Perspective], str, list[str]]:
        ps = _clip((problem_statement or "").strip(), 160) or "the problem"
        _, el = resolve_spark_target_text(spark, levers.spark_target)
        raw_target = (getattr(spark, el, None) or "").strip()
        target_snip = _clip(raw_target.replace("\n", " "), 120) or _clip(spark.situation, 120) or ps
        depth = levers.depth.lower()
        domain = levers.domain_lens
        tool_slug_map: dict[str, str] = {
            "Analogy": "analogy",
            "Re-categorization": "recategorization",
            "Combination": "combination",
            "Association": "association",
            "Auto-select best": "association",
        }
        tool_slug = tool_slug_map.get(levers.cognitive_tool, "analogy")
        n = max(1, min(num_outputs, 32))
        out: list[Perspective] = []
        for i in range(n):
            desc = (
                f"[{levers.cognitive_tool} · {depth} · {domain}] "
                f"Angle {i + 1} on «{target_snip}»: reinterpret «{ps}» "
                f"through {levers.abstraction.lower()} abstraction and "
                f"{levers.goal_priority.lower()} priority "
                f"({levers.novelty.lower()} novelty)."
            )
            out.append(
                Perspective(
                    perspective_id=str(uuid4()),
                    description=desc,
                    text=desc,
                    source_tool=tool_slug,
                    spark_element=el,
                    part_ref=_clip(target_snip, 80),
                    action_ref=None,
                )
            )
        rec = (
            f"Recommended: prioritize «{target_snip}» with {levers.cognitive_tool} "
            f"under a {levers.domain_lens} lens, emphasizing {levers.goal_priority}."
        )
        insight_candidates = [
            f"Test whether {levers.spark_target} is the real bottleneck before scaling a fix.",
            f"If {levers.goal_priority} matters most, narrow to one measurable signal for the next iteration.",
            f"Contrast a {levers.depth.lower()} path with one more radical option to surface tradeoffs.",
        ]
        return out, rec, insight_candidates

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
        tools = ["analogy", "recategorization", "combination", "association"]
        els = ["situation", "parts", "actions", "role", "key_goal"]
        ps = _clip((problem_statement or "").strip(), 140) or "the problem"
        n = max(1, min(max_perspectives, 32))
        out: list[Perspective] = []
        gp = goal_priority.value.replace("_", " ")
        for i in range(n):
            tool = tools[i % 4]
            el = els[i % 5]
            title = f"{tool.replace('recategorization', 'Re-categorization').title()} · {i + 1}"
            desc = (
                f"[{tool} | boldness={boldness.value} | novelty={novelty.value} | {gp}] "
                f"Apply {tool} to «{ps}» via SPARK dimension «{el}»."
            )
            why = f"Keeps {tool} distinct while matching global boldness/novelty/goal settings."
            body = f"{title}\n\n{desc}\n\n— {why}"
            out.append(
                Perspective(
                    perspective_id=str(uuid4()),
                    title=title,
                    description=desc,
                    text=body,
                    source_tool=tool,
                    spark_element=el,
                    why_interesting=why,
                    boldness_level=boldness.value,
                    novelty_level=novelty.value,
                    goal_priority_alignment=goal_priority.value,
                    selected=False,
                )
            )
        rec = out[0].text if out else None
        insight_candidates = [
            f"Prioritize {gp} when choosing which angle to test first.",
            "Contrast a low-cost probe with a higher-fidelity pilot.",
        ]
        return out, rec, insight_candidates

    async def insights_from_perspectives(
        self,
        *,
        spark: SparkState,
        perspectives: list[Perspective],
    ) -> list[str]:
        if not perspectives:
            return []
        kg = (spark.key_goal or "").strip()
        return [
            (
                f"Clarifying «{_clip(kg, 200)}» helps decide what to test first "
                "and what success should look like."
            ),
            "Small, observable experiments beat large commitments before assumptions are validated.",
        ]

    async def invention_from_insights(
        self,
        *,
        spark: SparkState,
        insights: list[str],
    ) -> InventionArtifact:
        anchor = _clip(spark.key_goal or spark.situation or "your challenge", 80)
        return InventionArtifact(
            title=f"Concept sketch: {anchor}",
            description=(
                f"A concrete intervention direction grounded in «{_clip(spark.key_goal or spark.situation, 400)}». "
                "Prototype the smallest version that delivers signal, then scale what works."
            ),
            benefits="Faster learning, clearer tradeoffs, less wasted build on wrong assumptions.",
            next_steps="Interview 3 stakeholders; paper prototype; define one success metric.",
        )

    async def enlightenment_from_work(
        self,
        *,
        spark: SparkState,
        insights: list[str],
        invention: InventionArtifact,
    ) -> EnlightenmentArtifact:
        _ = (spark, insights, invention)
        return EnlightenmentArtifact(
            summary=(
                "Structured exploration and early validation beat guessing the full solution upfront."
            ),
            principles=[
                "Anchor on the real problem statement, not the first idea.",
                "Make progress visible before scaling effort.",
            ],
            applies_elsewhere=(
                "Product discovery, org change, research, and any domain where uncertainty is high."
            ),
        )
