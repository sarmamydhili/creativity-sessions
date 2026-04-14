from __future__ import annotations

import re
from typing import Any
from uuid import uuid4

from fastapi import HTTPException, status

from app.ai.providers.creative_base import CreativeProvider
from app.ai.providers.openai_creative import OpenAICreativeProvider
from app.models.session import (
    EnlightenmentArtifact,
    EnlightenmentGenerateResponse,
    HistoryEntry,
    HistoryEventKind,
    InsightRecord,
    InsightsGenerateResponse,
    InventionArtifact,
    InventionGenerateResponse,
    Perspective,
    PerspectiveCreateRequest,
    PerspectiveSelectionResponse,
    PerspectiveUpdateRequest,
    PerspectivesCommitRequest,
    PerspectivesGenerateRequest,
    PerspectivesGenerateResponse,
    SessionDetail,
    SparkGenerateResponse,
    SparkState,
    SparkUpdateRequest,
    VariationItem,
    VariationsGenerateResponse,
    WorkflowStep,
)
from app.models.perspective_pool import (
    PerspectivePoolGenerateRequest,
    PerspectivePoolSettings,
)
from app.repositories.session_repository import SessionRepository
from app.services import insight_synthesis
from app.services.perspective_service import finalize_perspective_pool
from app.services.session_service import (
    SessionService,
    _normalize_doc,
    _parse_perspective,
    _parse_variations_from_raw,
)


def _step_rank(step: WorkflowStep) -> int:
    order = list(WorkflowStep)
    return order.index(step)


def _require_minimum_step(doc: dict[str, Any], minimum: WorkflowStep) -> None:
    d = _normalize_doc(doc)
    cur = WorkflowStep(d["current_step"])
    if _step_rank(cur) < _step_rank(minimum):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Workflow must reach {minimum.value} before this action (currently {cur.value})",
        )


VALID_SPARK_ELEMENTS = {"situation", "parts", "actions", "role", "key_goal"}

# Max saved lines per SPARK dimension (user + generated combined)
MAX_VARIATIONS_PER_ELEMENT = 6


def _cap_variation_list(
    items: list[VariationItem],
    max_n: int = MAX_VARIATIONS_PER_ELEMENT,
) -> list[VariationItem]:
    if len(items) <= max_n:
        return items
    users = [x for x in items if x.source == "user"]
    generated = [x for x in items if x.source != "user"]
    if len(users) >= max_n:
        return users[:max_n]
    take_gen = max_n - len(users)
    return users + generated[-take_gen:]


def _split_spark_field(text: str) -> list[str]:
    if not text or not str(text).strip():
        return []
    parts = re.split(r"[\n;]|,\s*", str(text))
    return [p.strip() for p in parts if p.strip()]


def _candidates_for_dimension(
    element_key: str,
    items: dict[str, list[VariationItem]],
    spark: SparkState,
) -> list[str]:
    from_items = [v.text.strip() for v in items.get(element_key, []) if v.text.strip()]
    if from_items:
        return from_items[:24]
    raw = getattr(spark, element_key, "") or ""
    lines = _split_spark_field(raw)
    if lines:
        return lines
    return [raw.strip()] if raw.strip() else []


def _merge_variation_strings(
    base: dict[str, list[VariationItem]],
    elements: list[str],
    new_strings: dict[str, list[str]],
) -> dict[str, list[VariationItem]]:
    """Replace prior AI lines for touched elements, append new ones, cap at MAX_VARIATIONS_PER_ELEMENT."""
    merged: dict[str, list[VariationItem]] = {k: list(v) for k, v in base.items()}
    for el in elements:
        key = el.lower().strip()
        if key not in merged:
            merged[key] = []
        merged[key] = [x for x in merged[key] if x.source == "user"]
        for s in new_strings.get(key, []):
            t = (s or "").strip()
            if not t:
                continue
            merged[key].append(
                VariationItem(
                    variation_id=str(uuid4()),
                    element=key,
                    text=t,
                    source="generated",
                )
            )
        merged[key] = _cap_variation_list(merged[key])
    return merged


class CreativeWorkflowService:
    def __init__(
        self,
        sessions: SessionService,
        repo: SessionRepository,
        provider: CreativeProvider,
    ) -> None:
        self._sessions = sessions
        self._repo = repo
        self._provider = provider

    def _hist(self, kind: HistoryEventKind, payload: dict[str, Any]) -> dict[str, Any]:
        return HistoryEntry(kind=kind, payload=payload).model_dump(mode="python")

    async def generate_spark(
        self,
        session_id: str,
        extra_context: str | None,
    ) -> SparkGenerateResponse:
        doc = await self._repo.find_by_session_id(session_id)
        if doc is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
        d = _normalize_doc(doc)
        # Allow generating or re-generating SPARK from any step so users can refresh
        # framing after variations/perspectives (downstream data is unchanged).
        spark = await self._provider.spark_breakdown(
            problem_statement=d["problem_statement"],
            title=d.get("title"),
            extra_context=extra_context,
        )
        prov_label = (
            "openai"
            if isinstance(self._provider, OpenAICreativeProvider)
            else "mock"
        )
        spark_payload: dict = {"provider": prov_label}
        if isinstance(self._provider, OpenAICreativeProvider):
            spark_payload["model"] = self._provider._model
        hist = self._hist(HistoryEventKind.spark_generated, spark_payload)
        iteration = int(d.get("current_iteration", 1)) + 1
        out = await self._repo.append_history_and_set(
            session_id,
            hist,
            {
                "spark_state": spark.model_dump(),
                "current_step": WorkflowStep.spark_generated.value,
                "current_iteration": iteration,
            },
        )
        assert out is not None
        return SparkGenerateResponse(
            session=self._sessions.to_detail(out),
            spark=spark,
        )

    async def update_spark(self, session_id: str, body: SparkUpdateRequest) -> SessionDetail:
        doc = await self._repo.find_by_session_id(session_id)
        if doc is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
        d = _normalize_doc(doc)
        if d.get("spark_state") is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No SPARK state to edit yet",
            )
        current = SparkState(
            **{k: d["spark_state"].get(k, "") for k in SparkState.model_fields},
        )
        data = body.model_dump(exclude_unset=True)
        merged = current.model_copy(update=data)
        hist = self._hist(
            HistoryEventKind.spark_edited,
            {"fields": list(data.keys())},
        )
        iteration = int(d.get("current_iteration", 1)) + 1
        out = await self._repo.append_history_and_set(
            session_id,
            hist,
            {"spark_state": merged.model_dump(), "current_iteration": iteration},
        )
        assert out is not None
        return self._sessions.to_detail(out)

    async def generate_variations(
        self,
        session_id: str,
        elements: list[str],
        existing_items: dict[str, list[VariationItem]] | None,
    ) -> VariationsGenerateResponse:
        doc = await self._repo.find_by_session_id(session_id)
        if doc is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
        d = _normalize_doc(doc)
        _require_minimum_step(doc, WorkflowStep.spark_generated)
        if not d.get("spark_state"):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="SPARK required")
        for el in elements:
            if el.lower().strip() not in VALID_SPARK_ELEMENTS:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Invalid SPARK element: {el}",
                )
        spark = SparkState(
            **{k: d["spark_state"].get(k, "") for k in SparkState.model_fields},
        )
        keys = [e.lower().strip() for e in elements]
        if existing_items is not None:
            base: dict[str, list[VariationItem]] = {
                k: list(v) for k, v in existing_items.items()
            }
        else:
            base = _parse_variations_from_raw(d.get("variations"))
        var_map = await self._provider.variations_for_elements(spark=spark, elements=keys)
        merged = _merge_variation_strings(base, keys, var_map)
        unchanged = await self._sessions.get_session(session_id)
        return VariationsGenerateResponse(
            session=unchanged,
            new_variations=var_map,
            merged_variations=merged,
        )

    async def persist_variations(
        self,
        session_id: str,
        items: dict[str, list[VariationItem]],
    ) -> SessionDetail:
        doc = await self._repo.find_by_session_id(session_id)
        if doc is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
        d = _normalize_doc(doc)
        _require_minimum_step(doc, WorkflowStep.spark_generated)
        if not d.get("spark_state"):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="SPARK required")
        capped = {k: _cap_variation_list(list(v)) for k, v in items.items()}
        mongo_var: dict[str, Any] = {
            k: [i.model_dump(mode="python") for i in v] for k, v in capped.items()
        }
        hist = self._hist(
            HistoryEventKind.variations_persisted,
            {"elements": list(items.keys())},
        )
        next_iter = int(d.get("current_iteration", 1)) + 1
        out = await self._repo.append_history_and_set(
            session_id,
            hist,
            {
                "variations": mongo_var,
                "current_step": WorkflowStep.variations_generated.value,
                "current_iteration": next_iter,
            },
        )
        assert out is not None
        return self._sessions.to_detail(out)

    async def generate_perspectives(
        self,
        session_id: str,
        req: PerspectivesGenerateRequest,
    ) -> PerspectivesGenerateResponse:
        doc = await self._repo.find_by_session_id(session_id)
        if doc is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
        d = _normalize_doc(doc)
        _require_minimum_step(doc, WorkflowStep.spark_generated)
        spark = SparkState(
            **{k: d["spark_state"].get(k, "") for k in SparkState.model_fields},
        )
        next_iter = int(d.get("current_iteration", 1)) + 1
        cur_iter = int(d.get("current_iteration", 1))
        recommended: str | None = None
        insight_cands: list[str] = []
        levers_applied = req.creative_levers

        if req.creative_levers is not None:
            num_outputs = min(req.max_perspectives, 32)
            raw_new, recommended, insight_cands = await self._provider.perspectives_with_creative_levers(
                problem_statement=d["problem_statement"],
                spark=spark,
                levers=req.creative_levers,
                num_outputs=num_outputs,
            )
            mode = "creative_levers"
            hist_payload: dict[str, Any] = {
                "mode": mode,
                "creative_levers": req.creative_levers.model_dump(by_alias=True),
                "recommended_perspective": recommended,
                "insight_candidates": insight_cands,
                "count": len(raw_new),
            }
            set_extra: dict[str, Any] = {
                "last_creative_levers": req.creative_levers.model_dump(by_alias=True),
                "last_recommended_perspective": recommended,
                "last_insight_candidates": insight_cands,
            }
        else:
            v_items = _parse_variations_from_raw(d.get("variations"))
            parts_c = _candidates_for_dimension("parts", v_items, spark)
            actions_c = _candidates_for_dimension("actions", v_items, spark)
            if not parts_c:
                parts_c = ["(SPARK parts)"]
            if not actions_c:
                actions_c = ["(SPARK actions)"]
            raw_new = await self._provider.perspectives_from_part_action_tool_matrix(
                problem_statement=d["problem_statement"],
                spark=spark,
                parts_candidates=parts_c,
                actions_candidates=actions_c,
                max_perspectives=req.max_perspectives,
            )
            mode = "parts_actions_tool_matrix"
            hist_payload = {"mode": mode, "count": len(raw_new)}
            set_extra = {}

        iter_for_cards = cur_iter if req.preview_only else next_iter
        new_ps = [p.model_copy(update={"iteration": iter_for_cards}) for p in raw_new]

        if req.preview_only:
            return PerspectivesGenerateResponse(
                session=self._sessions.to_detail(doc),
                perspectives=new_ps,
                recommended_perspective=recommended,
                insight_candidates=insight_cands,
                creative_levers_applied=levers_applied,
                perspective_pool_applied=None,
            )

        existing = _load_perspectives(d)
        combined = existing + new_ps
        tool_apps = list(d.get("tool_applications") or [])
        entry: dict[str, Any] = {
            "mode": mode,
            "iteration": next_iter,
            "perspective_ids": [p.perspective_id for p in new_ps],
        }
        if req.creative_levers is not None:
            entry["creative_levers"] = req.creative_levers.model_dump(by_alias=True)
        tool_apps.append(entry)
        hist = self._hist(HistoryEventKind.perspectives_generated, hist_payload)
        mongo_update: dict[str, Any] = {
            "perspectives": [p.model_dump(mode="python") for p in combined],
            "tool_applications": tool_apps,
            "current_step": WorkflowStep.perspectives_generated.value,
            "current_iteration": next_iter,
            **set_extra,
        }
        out = await self._repo.append_history_and_set(session_id, hist, mongo_update)
        assert out is not None
        return PerspectivesGenerateResponse(
            session=self._sessions.to_detail(out),
            perspectives=new_ps,
            recommended_perspective=recommended,
            insight_candidates=insight_cands,
            creative_levers_applied=levers_applied,
            perspective_pool_applied=None,
        )

    async def generate_perspective_pool(
        self,
        session_id: str,
        req: PerspectivePoolGenerateRequest,
    ) -> PerspectivesGenerateResponse:
        """Unified pool: one GenAI call, all four cognitive tools, boldness/novelty/goal only."""
        doc = await self._repo.find_by_session_id(session_id)
        if doc is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
        d = _normalize_doc(doc)
        _require_minimum_step(doc, WorkflowStep.spark_generated)
        spark = SparkState(
            **{k: d["spark_state"].get(k, "") for k in SparkState.model_fields},
        )
        next_iter = int(d.get("current_iteration", 1)) + 1
        cur_iter = int(d.get("current_iteration", 1))
        settings = PerspectivePoolSettings(
            boldness=req.boldness,
            novelty=req.novelty,
            goal_priority=req.goal_priority,
        )
        num = min(req.max_perspectives, 32)
        raw_new, recommended, insight_cands = await self._provider.generate_perspective_pool(
            problem_statement=d["problem_statement"],
            spark=spark,
            boldness=req.boldness,
            novelty=req.novelty,
            goal_priority=req.goal_priority,
            max_perspectives=num,
        )
        ranked_new = finalize_perspective_pool(
            raw_new,
            problem_statement=d["problem_statement"],
            spark=spark,
            settings=settings,
            rebalance_k=min(12, max(4, num)),
        )
        recommended = (
            (ranked_new[0].title or ranked_new[0].text or "").strip()
            if ranked_new
            else recommended
        )
        mode = "perspective_pool"
        hist_payload: dict[str, Any] = {
            "mode": mode,
            "perspective_pool": settings.model_dump(),
            "recommended_perspective": recommended,
            "insight_candidates": insight_cands,
            "count": len(ranked_new),
        }
        set_extra: dict[str, Any] = {
            "last_perspective_pool": settings.model_dump(),
            "last_recommended_perspective": recommended,
            "last_insight_candidates": insight_cands,
        }
        iter_for_cards = cur_iter if req.preview_only else next_iter
        new_ps = [p.model_copy(update={"iteration": iter_for_cards}) for p in ranked_new]

        if req.preview_only:
            return PerspectivesGenerateResponse(
                session=self._sessions.to_detail(doc),
                perspectives=new_ps,
                recommended_perspective=recommended,
                insight_candidates=insight_cands,
                creative_levers_applied=None,
                perspective_pool_applied=settings,
            )

        existing = _load_perspectives(d)
        combined = existing + new_ps
        tool_apps = list(d.get("tool_applications") or [])
        entry: dict[str, Any] = {
            "mode": mode,
            "iteration": next_iter,
            "perspective_ids": [p.perspective_id for p in new_ps],
            "perspective_pool": settings.model_dump(),
        }
        tool_apps.append(entry)
        hist = self._hist(HistoryEventKind.perspectives_generated, hist_payload)
        mongo_update: dict[str, Any] = {
            "perspectives": [p.model_dump(mode="python") for p in combined],
            "tool_applications": tool_apps,
            "current_step": WorkflowStep.perspectives_generated.value,
            "current_iteration": next_iter,
            **set_extra,
        }
        out = await self._repo.append_history_and_set(session_id, hist, mongo_update)
        assert out is not None
        return PerspectivesGenerateResponse(
            session=self._sessions.to_detail(out),
            perspectives=new_ps,
            recommended_perspective=recommended,
            insight_candidates=insight_cands,
            creative_levers_applied=None,
            perspective_pool_applied=settings,
        )

    async def commit_perspectives(
        self,
        session_id: str,
        req: PerspectivesCommitRequest,
    ) -> SessionDetail:
        """Replace stored perspectives with the user's committed selection (post-exploration)."""
        doc = await self._repo.find_by_session_id(session_id)
        if doc is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
        d = _normalize_doc(doc)
        _require_minimum_step(doc, WorkflowStep.spark_generated)
        if not d.get("spark_state"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="SPARK required",
            )
        next_iter = int(d.get("current_iteration", 1)) + 1
        normalized: list[Perspective] = []
        for p in req.perspectives:
            normalized.append(
                p.model_copy(update={"iteration": next_iter}),
            )
        hist_payload: dict[str, Any] = {
            "mode": "commit",
            "count": len(normalized),
        }
        if req.creative_levers is not None:
            hist_payload["creative_levers"] = req.creative_levers.model_dump(by_alias=True)
        if req.perspective_pool is not None:
            hist_payload["perspective_pool"] = req.perspective_pool.model_dump()
        hist = self._hist(HistoryEventKind.perspectives_generated, hist_payload)
        mongo_update: dict[str, Any] = {
            "perspectives": [p.model_dump(mode="python") for p in normalized],
            "current_step": WorkflowStep.perspectives_generated.value,
            "current_iteration": next_iter,
        }
        if req.creative_levers is not None:
            mongo_update["last_creative_levers"] = req.creative_levers.model_dump(by_alias=True)
        if req.perspective_pool is not None:
            mongo_update["last_perspective_pool"] = req.perspective_pool.model_dump()
        out = await self._repo.append_history_and_set(session_id, hist, mongo_update)
        assert out is not None
        return self._sessions.to_detail(out)

    async def toggle_perspective_selection(
        self,
        session_id: str,
        perspective_id: str,
        selected: bool,
    ) -> SessionDetail:
        doc = await self._repo.find_by_session_id(session_id)
        if doc is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
        d = _normalize_doc(doc)
        raw = d.get("perspectives") or []
        updated: list[dict[str, Any]] = []
        found = False
        for p in raw:
            if not isinstance(p, dict):
                continue
            if p.get("perspective_id") == perspective_id:
                updated.append({**p, "selected": selected})
                found = True
            else:
                updated.append(p)
        if not found:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Perspective not found in session",
            )
        hist = self._hist(
            HistoryEventKind.user_note,
            {"perspective_id": perspective_id, "selected": selected},
        )
        out = await self._repo.append_history_and_set(
            session_id,
            hist,
            {"perspectives": updated},
        )
        assert out is not None
        return self._sessions.to_detail(out)

    async def select_perspectives(
        self,
        session_id: str,
        perspective_ids: list[str],
    ) -> PerspectiveSelectionResponse:
        doc = await self._repo.find_by_session_id(session_id)
        if doc is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
        d = _normalize_doc(doc)
        chosen = set(perspective_ids)
        raw = d.get("perspectives") or []
        updated: list[dict[str, Any]] = []
        for p in raw:
            pid = p.get("perspective_id", "")
            updated.append({**p, "selected": pid in chosen})
        out = await self._repo.update_fields(
            session_id,
            {"perspectives": updated},
        )
        assert out is not None
        return PerspectiveSelectionResponse(session=self._sessions.to_detail(out))

    async def update_perspective(
        self,
        session_id: str,
        perspective_id: str,
        body: PerspectiveUpdateRequest,
    ) -> SessionDetail:
        doc = await self._repo.find_by_session_id(session_id)
        if doc is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
        d = _normalize_doc(doc)
        raw = d.get("perspectives") or []
        data = body.model_dump(exclude_unset=True)
        updated: list[dict[str, Any]] = []
        found = False
        for p in raw:
            if not isinstance(p, dict):
                continue
            if p.get("perspective_id") != perspective_id:
                updated.append(p)
                continue
            found = True
            merged = dict(p)
            if "text" in data or "description" in data:
                txt = data.get("text")
                if txt is None:
                    txt = data.get("description")
                if txt is not None:
                    merged["text"] = str(txt)
                    merged["description"] = str(txt)
            if "part_ref" in data:
                merged["part_ref"] = data["part_ref"]
            if "action_ref" in data:
                merged["action_ref"] = data["action_ref"]
            if "selected" in data:
                merged["selected"] = bool(data["selected"])
            if "promising" in data:
                merged["promising"] = bool(data["promising"])
            if "pool_excluded" in data:
                merged["pool_excluded"] = bool(data["pool_excluded"])
            updated.append(merged)
        if not found:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Perspective not found",
            )
        hist = self._hist(
            HistoryEventKind.perspective_updated,
            {"perspective_id": perspective_id, "fields": list(data.keys())},
        )
        out = await self._repo.append_history_and_set(
            session_id,
            hist,
            {"perspectives": updated},
        )
        assert out is not None
        return self._sessions.to_detail(out)

    async def delete_perspective(self, session_id: str, perspective_id: str) -> SessionDetail:
        doc = await self._repo.find_by_session_id(session_id)
        if doc is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
        d = _normalize_doc(doc)
        raw = d.get("perspectives") or []
        updated = [
            p
            for p in raw
            if isinstance(p, dict) and p.get("perspective_id") != perspective_id
        ]
        if len(updated) == len(raw):
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Perspective not found",
            )
        hist = self._hist(
            HistoryEventKind.perspective_deleted,
            {"perspective_id": perspective_id},
        )
        out = await self._repo.append_history_and_set(
            session_id,
            hist,
            {"perspectives": updated},
        )
        assert out is not None
        return self._sessions.to_detail(out)

    async def add_perspective(
        self,
        session_id: str,
        body: PerspectiveCreateRequest,
    ) -> SessionDetail:
        doc = await self._repo.find_by_session_id(session_id)
        if doc is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
        d = _normalize_doc(doc)
        _require_minimum_step(doc, WorkflowStep.spark_generated)
        txt = body.text.strip()
        p = Perspective(
            description=txt,
            text=txt,
            source_tool="user",
            spark_element="user",
            selected=False,
        )
        existing = [x for x in (d.get("perspectives") or []) if isinstance(x, dict)]
        combined = existing + [p.model_dump(mode="python")]
        hist = self._hist(
            HistoryEventKind.perspective_added,
            {"perspective_id": p.perspective_id},
        )
        out = await self._repo.append_history_and_set(
            session_id,
            hist,
            {"perspectives": combined},
        )
        assert out is not None
        return self._sessions.to_detail(out)

    async def generate_insights(self, session_id: str) -> InsightsGenerateResponse:
        doc = await self._repo.find_by_session_id(session_id)
        if doc is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
        d = _normalize_doc(doc)
        _require_minimum_step(doc, WorkflowStep.spark_generated)
        if not d.get("spark_state"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="SPARK required before insights",
            )
        perspectives = _load_perspectives(d)
        if not perspectives:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Add at least one perspective (Generate more AI, or add your own card) before insights.",
            )
        in_pool = [p for p in perspectives if not p.pool_excluded]
        if not in_pool:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="At least one perspective must be in the pool (clear “not in pool” on a card) before insights.",
            )
        selected = [p for p in in_pool if p.selected]
        if selected:
            use = selected
        else:
            use = _top_in_pool_perspectives_for_insights(in_pool, limit=10)
        validated = insight_synthesis.validate_insight_perspectives(use)
        if not validated:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Selected perspectives must include at least one non-empty card with a valid id.",
            )
        normalized = insight_synthesis.normalize_perspectives(validated)
        themes = insight_synthesis.build_theme_groups(normalized)
        problem_statement = str(d.get("problem_statement") or "")
        spark = SparkState(
            **{k: d["spark_state"].get(k, "") for k in SparkState.model_fields},
        )
        raw_insight_dicts = await self._provider.insights_from_perspectives(
            spark=spark,
            perspectives=normalized,
            problem_statement=problem_statement,
            theme_groups=themes,
        )
        finalized = insight_synthesis.finalize_insight_drafts_with_problem(
            raw_insight_dicts,
            problem_statement=problem_statement,
            themes=themes,
            normalized_perspectives=normalized,
        )
        if not finalized:
            finalized = insight_synthesis.salvage_if_all_filtered(
                raw_insight_dicts,
                themes=themes,
                normalized_perspectives=normalized,
            )
        next_iter = int(d.get("current_iteration", 1)) + 1
        insight_records: list[InsightRecord] = []
        for fd in finalized:
            why = str(fd.get("why_it_matters") or "").strip()
            tl = str(fd.get("theme_label") or "").strip()
            insight_records.append(
                InsightRecord(
                    insight_id=str(uuid4()),
                    iteration=next_iter,
                    text=str(fd.get("text", "")),
                    why_it_matters=why or None,
                    source_perspective_ids=list(fd.get("source_perspective_ids") or []),
                    source_tools=list(fd.get("source_tools") or []),
                    source_spark_elements=list(fd.get("source_spark_elements") or []),
                    theme_label=tl or None,
                )
            )
        if not insight_records:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Insight generation returned no usable statements. Try again or adjust perspectives.",
            )
        stored = [ir.model_dump(mode="python") for ir in insight_records]
        hist = self._hist(HistoryEventKind.insights_generated, {"count": len(stored)})
        out = await self._repo.append_history_and_set(
            session_id,
            hist,
            {
                "insights": stored,
                "current_step": WorkflowStep.insights_generated.value,
                "current_iteration": next_iter,
            },
        )
        assert out is not None
        return InsightsGenerateResponse(session=self._sessions.to_detail(out), insights=insight_records)

    async def generate_invention(self, session_id: str) -> InventionGenerateResponse:
        doc = await self._repo.find_by_session_id(session_id)
        if doc is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
        d = _normalize_doc(doc)
        _require_minimum_step(doc, WorkflowStep.spark_generated)
        if not d.get("spark_state"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="SPARK required before invention",
            )
        raw_insights = d.get("insights") or []
        insight_texts = _insight_texts_from(raw_insights)
        if not insight_texts:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Insights required before invention — generate insights first.",
            )
        spark = SparkState(
            **{k: d["spark_state"].get(k, "") for k in SparkState.model_fields},
        )
        inv = await self._provider.invention_from_insights(spark=spark, insights=insight_texts)
        hist = self._hist(HistoryEventKind.invention_generated, {"title": inv.title})
        next_iter = int(d.get("current_iteration", 1)) + 1
        prior_inv = _parse_inventions_list(d.get("inventions"))
        inv_dict = inv.model_dump(mode="python")
        inventions_out = prior_inv + [inv_dict]
        out = await self._repo.append_history_and_set(
            session_id,
            hist,
            {
                "invention": inv_dict,
                "inventions": inventions_out,
                "current_step": WorkflowStep.invention_generated.value,
                "current_iteration": next_iter,
            },
        )
        assert out is not None
        return InventionGenerateResponse(session=self._sessions.to_detail(out), invention=inv)

    async def generate_enlightenment(self, session_id: str) -> EnlightenmentGenerateResponse:
        doc = await self._repo.find_by_session_id(session_id)
        if doc is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
        d = _normalize_doc(doc)
        _require_minimum_step(doc, WorkflowStep.invention_generated)
        inv_raw = d.get("invention")
        if not inv_raw:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invention required before enlightenment",
            )
        invention = InventionArtifact(**inv_raw) if isinstance(inv_raw, dict) else inv_raw
        insight_texts = _insight_texts_from(d.get("insights") or [])
        spark = SparkState(
            **{k: d["spark_state"].get(k, "") for k in SparkState.model_fields},
        )
        en = await self._provider.enlightenment_from_work(
            spark=spark,
            insights=insight_texts,
            invention=invention,
        )
        hist = self._hist(HistoryEventKind.enlightenment_generated, {})
        iteration = int(d.get("current_iteration", 1)) + 1
        out = await self._repo.append_history_and_set(
            session_id,
            hist,
            {
                "enlightenment": en.model_dump(),
                "current_step": WorkflowStep.enlightenment_generated.value,
                "current_iteration": iteration,
            },
        )
        assert out is not None
        return EnlightenmentGenerateResponse(session=self._sessions.to_detail(out), enlightenment=en)


def _top_in_pool_perspectives_for_insights(
    in_pool: list[Perspective],
    *,
    limit: int = 10,
) -> list[Perspective]:
    """
    When no cards are selected for insights, use up to *limit* perspectives
    ranked by rank_score (highest first), stable tie-break by perspective_id.
    Cards without rank_score sort last among equals.
    """
    if not in_pool or limit <= 0:
        return []

    def sort_key(p: Perspective) -> tuple[float, str]:
        rs = p.rank_score
        if rs is None:
            return (float("-inf"), p.perspective_id)
        try:
            return (float(rs), p.perspective_id)
        except (TypeError, ValueError):
            return (float("-inf"), p.perspective_id)

    ranked = sorted(in_pool, key=sort_key, reverse=True)
    return ranked[: min(limit, len(ranked))]


def _load_perspectives(d: dict[str, Any]) -> list[Perspective]:
    out: list[Perspective] = []
    for p in d.get("perspectives") or []:
        if isinstance(p, dict):
            out.append(_parse_perspective(p))
    return out


def _insight_texts_from(raw: Any) -> list[str]:
    if not raw:
        return []
    texts: list[str] = []
    for item in raw:
        if isinstance(item, str):
            texts.append(item)
        elif isinstance(item, dict):
            t = item.get("text")
            if t:
                texts.append(str(t))
    return texts


def _parse_inventions_list(raw: Any) -> list[dict[str, Any]]:
    if not raw or not isinstance(raw, list):
        return []
    out: list[dict[str, Any]] = []
    for x in raw:
        if isinstance(x, dict):
            out.append(dict(x))
    return out
