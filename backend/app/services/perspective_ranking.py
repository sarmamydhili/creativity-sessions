"""Deterministic post-LLM scoring, ranking, and top-k diversity rebalancing for perspective pools."""

from __future__ import annotations

import math
import re
from dataclasses import dataclass
from typing import Final

from app.models.perspective_pool import BoldnessLevel, GoalPriorityPool, NoveltyLevel
from app.models.session import Perspective, SparkState

_STOP: Final[frozenset[str]] = frozenset(
    """
    the and for are but not you all can her was one our out day get has him his how its may new
    now old see two way who boy did let put say she too use help more stay with this that from
    they have been were said each which their time will about when what make like just into over
    such take than only some come also back after well work first even many must these most made
    does could should would might any both here there then much very being need want able ways
    idea ideas using onto them their those these than this with from while although because though
    """.split(),
)


@dataclass(frozen=True)
class RankingContext:
    problem_statement: str
    spark: SparkState
    boldness: BoldnessLevel
    novelty: NoveltyLevel
    goal_priority: GoalPriorityPool


@dataclass
class ScoredPerspective:
    perspective: Perspective
    total: float
    components: dict[str, float]


def _tokens(text: str) -> set[str]:
    raw = re.findall(r"[a-z0-9]+", (text or "").lower())
    return {w for w in raw if len(w) > 2 and w not in _STOP}


def _parse_level_label(label: str | None) -> float | None:
    if not label:
        return None
    t = label.strip().lower()
    if t == "low":
        return 0.0
    if t == "medium":
        return 0.5
    if t == "high":
        return 1.0
    return None


def _requested_tier(level: BoldnessLevel | NoveltyLevel) -> float:
    v = _parse_level_label(str(level.value))
    return v if v is not None else 0.5


def _tier_fit(requested: float, label: str | None) -> float:
    """How well a free-text tier label matches requested tier (0..1)."""
    got = _parse_level_label(label)
    if got is None:
        # Model often omits echo fields; avoid dragging everyone to the same mid-band.
        return 0.72
    dist = abs(requested - got)
    if dist < 0.01:
        return 1.0
    if dist <= 0.5:
        return 0.72
    return 0.38


def _relevance(p: Perspective, ctx: RankingContext) -> float:
    corpus = " ".join(
        [
            ctx.problem_statement,
            ctx.spark.situation,
            ctx.spark.parts,
            ctx.spark.actions,
            ctx.spark.role,
            ctx.spark.key_goal,
        ],
    )
    c = _tokens(corpus)
    body = " ".join(
        [
            p.title or "",
            p.description,
            p.text,
            p.why_interesting or "",
        ],
    )
    b = _tokens(body)
    if not b:
        return 0.0
    if not c:
        return 0.35
    inter = len(b & c)
    if inter == 0:
        return 0.0
    # Coverage: share of perspective tokens grounded in problem+SPARK (scales well for short cards).
    coverage = inter / max(len(b), 1)
    union = len(b | c)
    jaccard = inter / union if union else 0.0
    # Pure Jaccard punishes short perspectives vs a huge corpus; blend toward coverage.
    rel = 0.72 * coverage + 0.28 * min(1.0, jaccard * 2.5)
    return max(0.0, min(1.0, rel))


def _goal_alignment(p: Perspective, ctx: RankingContext) -> float:
    want = ctx.goal_priority.value.replace("_", " ").lower()
    want_key = ctx.goal_priority.value.lower()
    blob = " ".join(
        [
            p.goal_priority_alignment or "",
            p.title or "",
            p.description,
            p.text,
        ],
    ).lower()
    if want_key in blob or want in blob:
        return 1.0
    # Tokenize goal (handles cost_efficiency → cost, efficiency)
    want_parts = set(re.findall(r"[a-z0-9]{3,}", want.replace("_", " "))) - _STOP
    blob_toks = set(re.findall(r"[a-z0-9]+", blob)) - _STOP
    if not want_parts:
        return 0.55
    hit = len(want_parts & blob_toks)
    ratio = hit / len(want_parts)
    # Partial credit: one of two tokens hit should not floor to 0.5 only
    return max(0.0, min(1.0, 0.25 + 0.75 * ratio))


def compute_subtype_uniqueness(perspectives: list[Perspective]) -> dict[str, float]:
    """
    Rarer (tool, subtype) pairs in the batch score higher (0..1).
    Keyed by perspective_id.
    """
    n = len(perspectives)
    if n == 0:
        return {}
    pair_by_pid: dict[str, tuple[str, str]] = {}
    for p in perspectives:
        sub = (p.subtype or "").strip().lower() or "_none_"
        pair_by_pid[p.perspective_id] = (p.source_tool or "unknown", sub)
    counts: dict[tuple[str, str], int] = {}
    for k in pair_by_pid.values():
        counts[k] = counts.get(k, 0) + 1
    denom = max(n - 1, 1)
    out: dict[str, float] = {}
    for pid, k in pair_by_pid.items():
        c = counts[k]
        u = 1.0 - (c - 1) / denom
        out[pid] = max(0.0, min(1.0, u))
    return out


def compute_diversity_bonus(perspectives: list[Perspective]) -> dict[str, float]:
    """
    Tools below the ideal share (1/4 of pool) get a higher bonus (0..1), keyed by perspective_id.
    """
    n = len(perspectives)
    if n == 0:
        return {}
    tool_counts: dict[str, int] = {}
    for p in perspectives:
        t = p.source_tool or "unknown"
        tool_counts[t] = tool_counts.get(t, 0) + 1
    ideal = n / 4.0
    tool_bonus: dict[str, float] = {}
    for t, c in tool_counts.items():
        delta = abs(c - ideal) / (ideal + 1e-6)
        tool_bonus[t] = max(0.0, min(1.0, 1.0 - min(1.0, delta)))
    out: dict[str, float] = {}
    for p in perspectives:
        t = p.source_tool or "unknown"
        out[p.perspective_id] = tool_bonus.get(t, 0.5)
    return out


def score_perspective(
    p: Perspective,
    ctx: RankingContext,
    *,
    subtype_uniqueness: float,
    diversity_bonus: float,
) -> dict[str, float]:
    """Per-perspective component scores in [0, 1] (deterministic)."""
    rel = _relevance(p, ctx)
    nov = _tier_fit(_requested_tier(ctx.novelty), p.novelty_level)
    bold = _tier_fit(_requested_tier(ctx.boldness), p.boldness_level)
    sub_u = max(0.0, min(1.0, subtype_uniqueness))
    div = max(0.0, min(1.0, diversity_bonus))
    goal = _goal_alignment(p, ctx)
    return {
        "relevance": rel,
        "novelty_fit": nov,
        "boldness_fit": bold,
        "subtype_uniqueness": sub_u,
        "diversity_bonus": div,
        "goal_alignment": goal,
    }


def _weighted_total(components: dict[str, float]) -> float:
    return (
        0.30 * components["relevance"]
        + 0.20 * components["novelty_fit"]
        + 0.15 * components["boldness_fit"]
        + 0.15 * components["subtype_uniqueness"]
        + 0.10 * components["diversity_bonus"]
        + 0.10 * components["goal_alignment"]
    )


def _calibrate_display_scores(raw_totals: list[float]) -> list[float]:
    """
    Map raw weighted totals to a wider 0.07–0.97 band per batch (strictly increasing).
    Preserves sort order; makes relative quality visible in the UI.
    """
    if not raw_totals:
        return []
    lo, hi = min(raw_totals), max(raw_totals)
    span = hi - lo
    lo_out, hi_out = 0.07, 0.97
    if span < 1e-9:
        mid = round((lo_out + hi_out) / 2, 5)
        return [mid] * len(raw_totals)
    return [
        round(lo_out + ((t - lo) / span) * (hi_out - lo_out), 5) for t in raw_totals
    ]


def rank_perspectives(
    perspectives: list[Perspective],
    ctx: RankingContext,
) -> list[ScoredPerspective]:
    """Score each perspective and sort by weighted total (descending)."""
    if not perspectives:
        return []
    sub_map = compute_subtype_uniqueness(perspectives)
    div_map = compute_diversity_bonus(perspectives)
    rows: list[ScoredPerspective] = []
    for p in perspectives:
        comps = score_perspective(
            p,
            ctx,
            subtype_uniqueness=sub_map.get(p.perspective_id, 0.5),
            diversity_bonus=div_map.get(p.perspective_id, 0.5),
        )
        total = round(_weighted_total(comps), 6)
        rows.append(ScoredPerspective(perspective=p, total=total, components=comps))
    rows.sort(key=lambda r: (r.total, r.perspective.perspective_id), reverse=True)
    return rows


def rebalance_top_k(rows: list[ScoredPerspective], k: int) -> list[ScoredPerspective]:
    """
    Re-order the first *k* positions so no cognitive tool exceeds ~35% of those slots;
    remaining rows follow in score order. Deterministic tie-break by perspective_id.
    """
    if not rows or k <= 0:
        return list(rows)
    k = min(k, len(rows))
    max_per_tool = max(1, int(math.ceil(k * 0.35 + 1e-9)))

    by_id: dict[str, ScoredPerspective] = {r.perspective.perspective_id: r for r in rows}
    order_ids = [r.perspective.perspective_id for r in rows]
    selected: list[ScoredPerspective] = []
    tool_counts: dict[str, int] = {}

    def can_take(tool: str) -> bool:
        return tool_counts.get(tool, 0) < max_per_tool

    pool_ids = list(order_ids)
    while len(selected) < k and pool_ids:
        eligible = [i for i in pool_ids if can_take(by_id[i].perspective.source_tool or "unknown")]
        pick_from = eligible if eligible else pool_ids
        best_id = max(
            pick_from,
            key=lambda pid: (
                by_id[pid].total,
                by_id[pid].perspective.perspective_id,
            ),
        )
        sp = by_id[best_id]
        t = sp.perspective.source_tool or "unknown"
        tool_counts[t] = tool_counts.get(t, 0) + 1
        selected.append(sp)
        pool_ids.remove(best_id)

    selected_ids = {r.perspective.perspective_id for r in selected}
    tail = [by_id[i] for i in order_ids if i not in selected_ids]
    tail.sort(key=lambda r: (r.total, r.perspective.perspective_id), reverse=True)
    return selected + tail


def attach_rank_scores(rows: list[ScoredPerspective]) -> list[Perspective]:
    """
    Return perspectives in order with rank_score = batch-calibrated display score
    (monotonic in raw weighted total; see _calibrate_display_scores).
    """
    calibrated = _calibrate_display_scores([r.total for r in rows])
    return [
        r.perspective.model_copy(update={"rank_score": cal})
        for r, cal in zip(rows, calibrated)
    ]
