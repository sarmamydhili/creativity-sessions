"""Balanced tool + subtype slots for unified perspective pool (one GenAI call)."""

from __future__ import annotations

import math
from collections import deque
from typing import Final

TOOLS_ORDER: Final[tuple[str, ...]] = (
    "analogy",
    "recategorization",
    "combination",
    "association",
)

# Canonical subtype strings (must match prompt / model output)
SUBTYPES_BY_TOOL: Final[dict[str, tuple[str, ...]]] = {
    "analogy": (
        "functional",
        "process",
        "feedback_loop",
        "role",
        "failure_prevention",
    ),
    "recategorization": (
        "zoom_in",
        "zoom_out",
        "category_shift",
        "opposite_framing",
        "role_reversal",
    ),
    "combination": (
        "object_combination",
        "feature_combination",
        "role_combination",
        "system_combination",
        "cross_domain_hybrid",
    ),
    "association": (
        "symbolic",
        "environmental",
        "emotional",
        "random_stimulus",
        "pattern_association",
    ),
}


def _max_per_tool(n: int) -> int:
    """
    Upper bound per tool: at least ceil(n/4) so a balanced split is possible,
    and at least floor(35% * n) when that is feasible for larger pools.
    """
    if n <= 0:
        return 0
    min_for_balance = (n + len(TOOLS_ORDER) - 1) // len(TOOLS_ORDER)
    pct_cap = max(1, math.floor(n * 0.35 + 1e-9))
    return max(min_for_balance, pct_cap)


def compute_tool_counts(n: int) -> dict[str, int]:
    """
    Balanced integer counts per tool, each <= floor(0.35 * n), summing to n.
    """
    n = max(0, min(n, 32))
    if n == 0:
        return {t: 0 for t in TOOLS_ORDER}
    cap = _max_per_tool(n)
    base, rem = divmod(n, len(TOOLS_ORDER))
    counts = {t: base for t in TOOLS_ORDER}
    for i in range(rem):
        counts[TOOLS_ORDER[i]] += 1
    while any(counts[t] > cap for t in TOOLS_ORDER):
        over = [t for t in TOOLS_ORDER if counts[t] > cap]
        under = [t for t in TOOLS_ORDER if counts[t] < cap]
        if not over or not under:
            break
        counts[over[0]] -= 1
        counts[under[0]] += 1
    if n >= len(TOOLS_ORDER):
        while any(counts[t] == 0 for t in TOOLS_ORDER):
            donor = max(TOOLS_ORDER, key=lambda t: counts[t])
            receiver = next(t for t in TOOLS_ORDER if counts[t] == 0)
            if counts[donor] <= 1:
                break
            counts[donor] -= 1
            counts[receiver] += 1
    return counts


def build_allocation_slots(n: int) -> list[dict[str, str]]:
    """
    Ordered slots: each dict has tool + subtype for one perspective.
    Tools are interleaved round-robin; subtypes cycle within each tool's list.
    """
    n = max(0, min(n, 32))
    counts = compute_tool_counts(n)
    queues: dict[str, deque[dict[str, str]]] = {t: deque() for t in TOOLS_ORDER}
    for tool in TOOLS_ORDER:
        subs = SUBTYPES_BY_TOOL[tool]
        k = counts[tool]
        for i in range(k):
            queues[tool].append({"tool": tool, "subtype": subs[i % len(subs)]})
    interleaved: list[dict[str, str]] = []
    while sum(len(q) for q in queues.values()) > 0:
        for t in TOOLS_ORDER:
            if queues[t]:
                interleaved.append(queues[t].popleft())
    return interleaved[:n]
