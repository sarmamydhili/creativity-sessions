"""
Deterministic pipeline around LLM insight synthesis: validate, normalize,
overlap clustering, theme grouping, weak-insight filtering, provenance, ranking.
"""

from __future__ import annotations

import re
from math import inf
from typing import Any

from app.models.session import Perspective

_STOP = frozenset(
    """
    the and for are but not you all can her was one our out day get has him his how its may new
    now old see two way who boy did let put say she too use help more stay with this that from
    they have been were said each which their time will about when what make like just into over
    such take than only some come also back after well work first even many must these most made
    does could should would might any both here there then much very being need want able ways
    idea ideas using onto them their those these while although because though from with that
    this into than then there here where which while
    """.split()
)

_JACCARD_OVERLAP_THRESHOLD = 0.42

# Heuristic filters (deterministic); LLM still does synthesis.
_GENERIC_PATTERNS = [
    re.compile(r"\b(is important|is crucial|matters a lot|can help|can be helpful)\b", re.I),
    re.compile(r"\b(people should|everyone should|always remember to)\b", re.I),
    re.compile(r"\b(technology can help|tech can help)\b", re.I),
    re.compile(r"\b(hydration is important|drink more water|stay hydrated)\b", re.I),
    re.compile(r"\b(a smartwatch|smartwatch|an app that|mobile app that)\b", re.I),
]
_MOTIVATIONAL = re.compile(
    r"\b(believe in yourself|never give up|stay motivated|dream big|you got this)\b", re.I
)
_INVENTIONISH = re.compile(
    r"\b(build|create|launch)\s+(a|an)\s+(new\s+)?(app|device|product|platform|wearable|system)\b",
    re.I,
)


def _tokenize(text: str) -> set[str]:
    words = re.findall(r"[a-z0-9']+", (text or "").lower())
    return {w for w in words if len(w) > 2 and w not in _STOP}


def _jaccard(a: set[str], b: set[str]) -> float:
    if not a and not b:
        return 1.0
    if not a or not b:
        return 0.0
    inter = len(a & b)
    union = len(a | b)
    return inter / union if union else 0.0


def _normalize_tool(raw: str) -> str:
    t = (raw or "").strip().lower().replace(" ", "_").replace("-", "_")
    if t in ("re_categorization", "recategorisation"):
        return "recategorization"
    if t in ("analogy", "recategorization", "combination", "association", "user"):
        return t
    return t or "unknown"


def _normalize_spark_el(raw: str) -> str:
    t = (raw or "").strip().lower().replace(" ", "_").replace("-", "_")
    if t in ("keygoal", "key-goal"):
        return "key_goal"
    if t in ("situation", "parts", "actions", "role", "key_goal", "user"):
        return t
    return t or "unknown"


def validate_insight_perspectives(perspectives: list[Perspective]) -> list[Perspective]:
    """Drop empty or malformed perspectives; require stable id and non-empty body."""
    out: list[Perspective] = []
    for p in perspectives:
        pid = str(getattr(p, "perspective_id", "") or "").strip()
        if not pid:
            continue
        body = (p.text or p.description or "").strip()
        if not body:
            continue
        out.append(p)
    return out


def normalize_perspectives(perspectives: list[Perspective]) -> list[Perspective]:
    """Trim text fields; normalize tool / spark_element slugs for synthesis + provenance."""
    out: list[Perspective] = []
    for p in perspectives:
        text = (p.text or "").strip()
        desc = (p.description or "").strip()
        title = (p.title or "").strip() if p.title else None
        if desc and not text:
            text = desc
        elif text and not desc:
            desc = text
        tool = _normalize_tool(p.source_tool or "")
        el = _normalize_spark_el(p.spark_element or "")
        out.append(
            p.model_copy(
                update={
                    "text": text,
                    "description": desc,
                    "title": title or None,
                    "source_tool": tool,
                    "spark_element": el,
                }
            )
        )
    return out


class _UF:
    def __init__(self, n: int) -> None:
        self.p = list(range(n))
        self.r = [0] * n

    def find(self, x: int) -> int:
        while self.p[x] != x:
            self.p[x] = self.p[self.p[x]]
            x = self.p[x]
        return x

    def union(self, a: int, b: int) -> None:
        ra, rb = self.find(a), self.find(b)
        if ra == rb:
            return
        if self.r[ra] < self.r[rb]:
            ra, rb = rb, ra
        self.p[rb] = ra
        if self.r[ra] == self.r[rb]:
            self.r[ra] += 1


def cluster_overlapping_perspectives(
    perspectives: list[Perspective],
    *,
    threshold: float = _JACCARD_OVERLAP_THRESHOLD,
) -> list[list[Perspective]]:
    """Group perspectives whose wording/concepts overlap strongly (union–find on Jaccard)."""
    n = len(perspectives)
    if n <= 1:
        return [list(perspectives)] if n == 1 else []
    toks = [_tokenize((p.text or "") + " " + (p.description or "")) for p in perspectives]
    uf = _UF(n)
    for i in range(n):
        for j in range(i + 1, n):
            if _jaccard(toks[i], toks[j]) >= threshold:
                uf.union(i, j)
    buckets: dict[int, list[Perspective]] = {}
    for i in range(n):
        r = uf.find(i)
        buckets.setdefault(r, []).append(perspectives[i])
    # Stable order by first appearance index
    order: list[int] = []
    seen: set[int] = set()
    for i in range(n):
        r = uf.find(i)
        if r not in seen:
            seen.add(r)
            order.append(r)
    return [buckets[r] for r in order]


def _theme_cluster_count(num_overlap_clusters: int) -> int:
    """Target 2–4 themes from overlap clusters where possible."""
    m = num_overlap_clusters
    if m <= 1:
        return 1
    if m == 2:
        return 2
    return min(4, max(2, (m + 2) // 3))


def _combined_cluster_text(cluster: list[Perspective]) -> str:
    parts: list[str] = []
    for p in cluster:
        parts.append((p.text or p.description or "").strip())
    return " ".join(x for x in parts if x)


def _theme_label_from_text(text: str) -> str:
    toks = [t for t in sorted(_tokenize(text), key=len, reverse=True)[:6]]
    if not toks:
        return "Cross-cutting pattern"
    # Prefer slightly readable label from distinctive tokens
    toks = toks[:4]
    return " · ".join(w[:24].title() for w in toks)


def _agglomerate_indices(cluster_texts: list[str], k: int) -> list[list[int]]:
    """Merge closest clusters until exactly *k* groups remain."""
    n = len(cluster_texts)
    if n == 0:
        return []
    if k >= n:
        return [[i] for i in range(n)]
    groups: list[list[int]] = [[i] for i in range(n)]

    def group_text(g: list[int]) -> str:
        return " ".join(cluster_texts[i] for i in g)

    while len(groups) > k:
        best = (inf, -1, -1)
        for i in range(len(groups)):
            for j in range(i + 1, len(groups)):
                ti, tj = _tokenize(group_text(groups[i])), _tokenize(group_text(groups[j]))
                dist = 1.0 - _jaccard(ti, tj)
                if dist < best[0]:
                    best = (dist, i, j)
        _, i, j = best
        merged = groups[i] + groups[j]
        keep = [g for idx, g in enumerate(groups) if idx not in (i, j)]
        keep.append(merged)
        groups = keep
    return groups


def build_theme_groups(perspectives: list[Perspective]) -> list[dict[str, Any]]:
    """
    Overlap-merge perspectives, then agglomerate into 2–4 themes when possible.
    Each theme includes perspective_ids and brief cards for the LLM.
    """
    validated = validate_insight_perspectives(perspectives)
    normalized = normalize_perspectives(validated)
    overlap_clusters = cluster_overlapping_perspectives(normalized)
    overlap_cluster_texts = [_combined_cluster_text(c) for c in overlap_clusters]
    m = len(overlap_cluster_texts)
    k = _theme_cluster_count(m)
    index_groups = _agglomerate_indices(overlap_cluster_texts, k)
    themes: list[dict[str, Any]] = []
    for tidx, gi in enumerate(index_groups):
        members: list[Perspective] = []
        combined = " ".join(overlap_cluster_texts[i] for i in gi)
        for ci in gi:
            members.extend(overlap_clusters[ci])
        label = _theme_label_from_text(combined)
        themes.append(
            {
                "theme_index": tidx,
                "theme_label": label,
                "perspective_ids": [p.perspective_id for p in members],
                "perspectives": [
                    {
                        "perspective_id": p.perspective_id,
                        "text": ((p.text or p.description or "").strip())[:900],
                        "source_tool": p.source_tool or "",
                        "spark_element": p.spark_element or "",
                        "title": (p.title or "").strip()[:160] or None,
                    }
                    for p in members
                ],
            }
        )
    return themes


def filter_weak_insight_drafts(
    drafts: list[dict[str, Any]],
    *,
    problem_statement: str,
    perspective_texts: list[str],
) -> list[dict[str, Any]]:
    """
    Drop generic, near-duplicate-of-problem, near-duplicate-of-perspective,
    invention-shaped, or motivational one-liners.
    """
    ps_tokens = _tokenize(problem_statement)
    p_toks = [_tokenize(t) for t in perspective_texts]
    kept: list[dict[str, Any]] = []
    for d in drafts:
        text = str(d.get("text", "")).strip()
        why = str(d.get("why_it_matters", "")).strip()
        if len(text) < 38:
            continue
        if _MOTIVATIONAL.search(text) or _INVENTIONISH.search(text):
            continue
        if any(pat.search(text) for pat in _GENERIC_PATTERNS):
            continue
        if ps_tokens and _jaccard(_tokenize(text), ps_tokens) > 0.52:
            continue
        if any(_jaccard(_tokenize(text), pt) > 0.62 for pt in p_toks if pt):
            continue
        # Penalize list-like "insight" that is really a feature bullet
        if text.count(":") >= 2 and len(text) < 120:
            continue
        d = dict(d)
        d["text"] = text
        if why:
            d["why_it_matters"] = why
        kept.append(d)
    return kept


def _resolve_provenance(
    draft: dict[str, Any],
    *,
    themes: list[dict[str, Any]],
    all_perspective_ids: list[str],
    id_to_perspective: dict[str, Perspective],
) -> dict[str, Any]:
    """Attach source ids, tools, spark elements, theme_label using LLM hints + validation."""
    allowed = set(all_perspective_ids)
    raw_ids = draft.get("source_perspective_ids")
    pids: list[str] = []
    if isinstance(raw_ids, list):
        for x in raw_ids:
            s = str(x).strip()
            if s in allowed:
                pids.append(s)
    theme_idx = draft.get("theme_index")
    theme_label_llm = str(draft.get("theme_label") or "").strip()
    if not pids and isinstance(theme_idx, int) and 0 <= theme_idx < len(themes):
        pids = [str(x) for x in themes[theme_idx].get("perspective_ids", []) if str(x) in allowed]
    if not pids:
        pids = list(all_perspective_ids)
    # Dedupe preserve order
    seen: set[str] = set()
    pids = [x for x in pids if not (x in seen or seen.add(x))]
    tools: list[str] = []
    elements: list[str] = []
    seen_t: set[str] = set()
    seen_e: set[str] = set()
    for pid in pids:
        p = id_to_perspective.get(pid)
        if not p:
            continue
        t = (p.source_tool or "").strip()
        e = (p.spark_element or "").strip()
        if t and t not in seen_t:
            seen_t.add(t)
            tools.append(t)
        if e and e not in seen_e:
            seen_e.add(e)
            elements.append(e)
    theme_label = theme_label_llm
    if not theme_label and isinstance(theme_idx, int) and 0 <= theme_idx < len(themes):
        theme_label = str(themes[theme_idx].get("theme_label") or "")
    out = dict(draft)
    out["source_perspective_ids"] = pids
    out["source_tools"] = tools
    out["source_spark_elements"] = elements
    if theme_label:
        out["theme_label"] = theme_label[:200]
    return out


def rank_insight_drafts(drafts: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Prefer cross-perspective synthesis, multiple tools, and substantive why_it_matters."""

    def score(d: dict[str, Any]) -> tuple[float, int]:
        tools = d.get("source_tools") or []
        pids = d.get("source_perspective_ids") or []
        why = str(d.get("why_it_matters") or "")
        t = len(tools) if isinstance(tools, list) else 0
        n = len(pids) if isinstance(pids, list) else 0
        base = t * 2.5 + n * 1.2 + (min(len(why), 200) / 50.0)
        return (base, -len(str(d.get("text", ""))))

    return sorted(drafts, key=score, reverse=True)


def finalize_insight_drafts_with_problem(
    drafts: list[dict[str, Any]],
    *,
    problem_statement: str,
    themes: list[dict[str, Any]],
    normalized_perspectives: list[Perspective],
) -> list[dict[str, Any]]:
    texts = [(p.text or p.description or "").strip() for p in normalized_perspectives]
    filtered = filter_weak_insight_drafts(
        drafts,
        problem_statement=problem_statement,
        perspective_texts=texts,
    )
    id_map = {p.perspective_id: p for p in normalized_perspectives}
    all_ids = [p.perspective_id for p in normalized_perspectives]
    with_prov = [
        _resolve_provenance(d, themes=themes, all_perspective_ids=all_ids, id_to_perspective=id_map)
        for d in filtered
    ]
    return rank_insight_drafts(with_prov)


def salvage_if_all_filtered(
    raw_drafts: list[dict[str, Any]],
    *,
    themes: list[dict[str, Any]],
    normalized_perspectives: list[Perspective],
) -> list[dict[str, Any]]:
    """
    If strict filtering removes every insight, keep non-empty LLM lines with provenance only
    (no generic/heuristic filter) so the session does not end up with zero insights.
    """
    id_map = {p.perspective_id: p for p in normalized_perspectives}
    all_ids = [p.perspective_id for p in normalized_perspectives]
    salvaged: list[dict[str, Any]] = []
    for d in raw_drafts:
        text = str(d.get("text", "")).strip()
        if len(text) < 28:
            continue
        salvaged.append(
            _resolve_provenance(
                dict(d),
                themes=themes,
                all_perspective_ids=all_ids,
                id_to_perspective=id_map,
            )
        )
    return rank_insight_drafts(salvaged[:5])
