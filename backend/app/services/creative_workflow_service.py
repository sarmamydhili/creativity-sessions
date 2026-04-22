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
    GhostProposal,
    HistoryEntry,
    HistoryEventKind,
    InsightRecord,
    InsightsGenerateResponse,
    InventionArtifact,
    InventionGenerateResponse,
    Perspective,
    PerspectiveCreateRequest,
    PerspectiveSelectionResponse,
    ProposeChangesRequest,
    ProposeChangesResponse,
    PerspectiveUpdateRequest,
    PerspectivesCommitRequest,
    PerspectivesGenerateRequest,
    PerspectivesGenerateResponse,
    SessionDetail,
    SparkGenerateResponse,
    SparkState,
    SparkUpdateRequest,
    StakeholderFeatureCard,
    StakeholderFeatureCardsGenerateResponse,
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


def _normalize_role_text(text: str) -> str:
    return re.sub(r"\s+", " ", str(text or "").strip())


def _sanitize_role_list(values: Any) -> list[str]:
    if not isinstance(values, list):
        return []
    out: list[str] = []
    seen: set[str] = set()
    for item in values:
        label = _normalize_role_text(str(item))
        if not label:
            continue
        key = label.lower()
        if key in seen:
            continue
        seen.add(key)
        out.append(label)
    return out


def _heuristic_roles_from_spark_role(role_text: str) -> list[str]:
    base = _split_spark_field(role_text or "")
    if not base:
        return ["Creator"]
    cleaned: list[str] = []
    seen: set[str] = set()
    for raw in base:
        label = _normalize_role_text(raw)
        if not label:
            continue
        key = label.lower()
        if key in seen:
            continue
        seen.add(key)
        cleaned.append(label)
    return cleaned or ["Creator"]


def _build_role_persistence_update(d: dict[str, Any], spark_role_text: str) -> dict[str, Any]:
    generated = _heuristic_roles_from_spark_role(spark_role_text)
    user_roles = _sanitize_role_list(d.get("roles_user"))
    active: list[str] = []
    seen: set[str] = set()
    for role in [*generated, *user_roles]:
        key = role.lower()
        if key in seen:
            continue
        seen.add(key)
        active.append(role)
    return {
        "roles_generated": generated,
        "roles_user": user_roles,
        "roles_active": active,
    }


def _active_stakeholders_for_session(d: dict[str, Any]) -> list[str]:
    roles_active = _sanitize_role_list(d.get("roles_active"))
    if roles_active:
        return roles_active
    roles_generated = _sanitize_role_list(d.get("roles_generated"))
    if roles_generated:
        return roles_generated
    return ["Creator"]


def _parse_stored_feature_cards(raw: Any) -> list[StakeholderFeatureCard]:
    if not isinstance(raw, list):
        return []
    out: list[StakeholderFeatureCard] = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        ftype = str(item.get("feature_type") or "functional").strip().lower()
        if ftype not in ("functional", "technical"):
            ftype = "functional"
        out.append(
            StakeholderFeatureCard(
                feature_id=item.get("feature_id") or str(uuid4()),
                iteration=int(item.get("iteration", 1)),
                stakeholder=str(item.get("stakeholder") or "Creator").strip() or "Creator",
                feature_type=ftype,  # type: ignore[arg-type]
                title=str(item.get("title") or "").strip(),
                description=str(item.get("description") or "").strip(),
                why_it_matters=(str(item.get("why_it_matters") or "").strip() or None),
                source_perspective_ids=[
                    str(x).strip()
                    for x in (item.get("source_perspective_ids") or [])
                    if str(x).strip()
                ],
                source_insight_ids=[
                    str(x).strip()
                    for x in (item.get("source_insight_ids") or [])
                    if str(x).strip()
                ],
                selected=bool(item.get("selected", False)),
                priority=(str(item.get("priority") or "").strip() or None),
            )
        )
    return out


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
            **_build_role_persistence_update(d, spark.role),
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
            **_build_role_persistence_update(d, spark.role),
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
        spark_role_text = ""
        spark_state_raw = d.get("spark_state")
        if isinstance(spark_state_raw, dict):
            spark_role_text = str(spark_state_raw.get("role") or "")
        mongo_update: dict[str, Any] = {
            "perspectives": [p.model_dump(mode="python") for p in normalized],
            "current_step": WorkflowStep.perspectives_generated.value,
            "current_iteration": next_iter,
            **_build_role_persistence_update(d, spark_role_text),
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
            if "position" in data and isinstance(data["position"], dict):
                x_raw = data["position"].get("x", 0.0)
                y_raw = data["position"].get("y", 0.0)
                try:
                    x = float(x_raw)
                except (TypeError, ValueError):
                    x = 0.0
                try:
                    y = float(y_raw)
                except (TypeError, ValueError):
                    y = 0.0
                merged["position"] = {"x": x, "y": y}
            if "is_ghost" in data and data["is_ghost"] is not None:
                merged["is_ghost"] = bool(data["is_ghost"])
            if "approved_from_ghost" in data and data["approved_from_ghost"] is not None:
                merged["approved_from_ghost"] = bool(data["approved_from_ghost"])
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

    async def propose_changes(
        self,
        session_id: str,
        body: ProposeChangesRequest,
    ) -> ProposeChangesResponse:
        if not isinstance(self._provider, OpenAICreativeProvider):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    "Ask AI Agent for Suggestions requires OpenAI provider. "
                    "Set OPENAI_API_KEY and AI_PROVIDER=openai, then restart backend."
                ),
            )
        doc = await self._repo.find_by_session_id(session_id)
        if doc is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
        d = _normalize_doc(doc)
        _require_minimum_step(doc, WorkflowStep.spark_generated)
        perspectives = [p for p in _load_perspectives(d) if not p.pool_excluded]
        if not perspectives:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Need at least one in-pool perspective before proposing changes.",
            )
        spark = SparkState(
            **{k: d["spark_state"].get(k, "") for k in SparkState.model_fields},
        )
        raw = await self._provider.propose_perspective_changes(
            problem_statement=str(d.get("problem_statement") or ""),
            spark=spark,
            perspectives=perspectives,
            max_proposals=body.max_proposals,
        )
        proposals = _build_ghost_proposals(
            raw,
            perspectives=perspectives,
            max_proposals=body.max_proposals,
        )
        return ProposeChangesResponse(
            session=self._sessions.to_detail(doc),
            proposals=proposals,
        )

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
        source_tool = (body.source_tool or "user").strip() or "user"
        spark_element = (body.spark_element or "user").strip() or "user"
        title = body.title.strip() if isinstance(body.title, str) and body.title.strip() else None
        subtype = body.subtype.strip() if isinstance(body.subtype, str) and body.subtype.strip() else None
        why_interesting = (
            body.why_interesting.strip()
            if isinstance(body.why_interesting, str) and body.why_interesting.strip()
            else None
        )
        pos = {"x": 0.0, "y": 0.0}
        if isinstance(body.position, dict):
            try:
                pos["x"] = float(body.position.get("x", 0.0))
            except (TypeError, ValueError):
                pos["x"] = 0.0
            try:
                pos["y"] = float(body.position.get("y", 0.0))
            except (TypeError, ValueError):
                pos["y"] = 0.0
        p = Perspective(
            description=txt,
            text=txt,
            title=title,
            source_tool=source_tool,
            spark_element=spark_element,
            subtype=subtype,
            why_interesting=why_interesting,
            position=pos,
            is_ghost=bool(body.is_ghost) if body.is_ghost is not None else False,
            approved_from_ghost=(
                bool(body.approved_from_ghost)
                if body.approved_from_ghost is not None
                else False
            ),
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

    async def generate_stakeholder_feature_cards(
        self,
        session_id: str,
        max_cards: int = 24,
    ) -> StakeholderFeatureCardsGenerateResponse:
        doc = await self._repo.find_by_session_id(session_id)
        if doc is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
        d = _normalize_doc(doc)
        _require_minimum_step(doc, WorkflowStep.spark_generated)
        if not d.get("spark_state"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="SPARK required before stakeholder feature cards",
            )
        perspectives = _load_perspectives(d)
        if not perspectives:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Save perspectives first before generating stakeholder feature cards.",
            )
        in_pool = [p for p in perspectives if not p.pool_excluded]
        if not in_pool:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="At least one perspective must be in the pool before generating stakeholder feature cards.",
            )
        spark = SparkState(
            **{k: d["spark_state"].get(k, "") for k in SparkState.model_fields},
        )
        stakeholders = _active_stakeholders_for_session(d)
        drafts = await self._provider.stakeholder_feature_cards_from_perspectives(
            spark=spark,
            perspectives=in_pool,
            stakeholders=stakeholders,
            problem_statement=str(d.get("problem_statement") or ""),
            max_cards=max_cards,
        )
        next_iter = int(d.get("current_iteration", 1)) + 1
        cards: list[StakeholderFeatureCard] = []
        perspective_ids = {p.perspective_id for p in in_pool}
        for item in drafts:
            if not isinstance(item, dict):
                continue
            stakeholder = _normalize_role_text(str(item.get("stakeholder") or "Creator"))
            if not stakeholder:
                stakeholder = "Creator"
            if stakeholder.lower() not in {x.lower() for x in stakeholders}:
                continue
            feature_type = str(item.get("feature_type") or "functional").strip().lower()
            if feature_type not in ("functional", "technical"):
                feature_type = "functional"
            title = str(item.get("title") or "").strip()
            description = str(item.get("description") or "").strip()
            if not title or not description:
                continue
            source_pids = [
                str(x).strip()
                for x in (item.get("source_perspective_ids") or [])
                if str(x).strip() and str(x).strip() in perspective_ids
            ]
            if not source_pids:
                continue
            priority = str(item.get("priority") or "").strip().lower()
            if priority not in ("high", "medium", "low"):
                priority = "medium"
            cards.append(
                StakeholderFeatureCard(
                    iteration=next_iter,
                    stakeholder=stakeholder,
                    feature_type=feature_type,  # type: ignore[arg-type]
                    title=title[:90],
                    description=description[:400],
                    why_it_matters=str(item.get("why_it_matters") or "").strip()[:240] or None,
                    source_perspective_ids=source_pids,
                    source_insight_ids=[],
                    selected=False,
                    priority=priority,
                )
            )
            if len(cards) >= max(4, min(max_cards, 64)):
                break
        if not cards:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Feature-card generation returned no usable cards. Try again or adjust perspectives.",
            )
        hist = self._hist(
            HistoryEventKind.user_note,
            {"mode": "stakeholder_feature_cards_generated", "count": len(cards)},
        )
        out = await self._repo.append_history_and_set(
            session_id,
            hist,
            {
                "stakeholder_feature_cards": [c.model_dump(mode="python") for c in cards],
                "current_iteration": next_iter,
            },
        )
        assert out is not None
        return StakeholderFeatureCardsGenerateResponse(
            session=self._sessions.to_detail(out),
            stakeholder_feature_cards=cards,
        )

    async def select_stakeholder_feature_cards(
        self,
        session_id: str,
        feature_ids: list[str],
    ) -> StakeholderFeatureCardsGenerateResponse:
        doc = await self._repo.find_by_session_id(session_id)
        if doc is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
        d = _normalize_doc(doc)
        cards = _parse_stored_feature_cards(d.get("stakeholder_feature_cards"))
        if not cards:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Generate stakeholder feature cards first.",
            )
        chosen = {str(x).strip() for x in feature_ids if str(x).strip()}
        updated = [c.model_copy(update={"selected": c.feature_id in chosen}) for c in cards]
        hist = self._hist(
            HistoryEventKind.user_note,
            {"mode": "stakeholder_feature_cards_selected", "count": len(chosen)},
        )
        out = await self._repo.append_history_and_set(
            session_id,
            hist,
            {"stakeholder_feature_cards": [c.model_dump(mode="python") for c in updated]},
        )
        assert out is not None
        return StakeholderFeatureCardsGenerateResponse(
            session=self._sessions.to_detail(out),
            stakeholder_feature_cards=updated,
        )

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
        selected_feature_cards = [
            c for c in _parse_stored_feature_cards(d.get("stakeholder_feature_cards")) if c.selected
        ]
        feature_texts = [
            (
                f"[Stakeholder: {c.stakeholder} | {c.feature_type}] {c.title}: {c.description}"
                + (f" Why: {c.why_it_matters}" if c.why_it_matters else "")
            )
            for c in selected_feature_cards
        ]
        invention_inputs = insight_texts + feature_texts
        if not invention_inputs:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Generate insights or select stakeholder feature cards before building product.",
            )
        spark = SparkState(
            **{k: d["spark_state"].get(k, "") for k in SparkState.model_fields},
        )
        inv = await self._provider.invention_from_insights(spark=spark, insights=invention_inputs)
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


def _as_xy(raw: Any) -> tuple[float, float]:
    if not isinstance(raw, dict):
        return (0.0, 0.0)
    try:
        x = float(raw.get("x", 0.0))
    except (TypeError, ValueError):
        x = 0.0
    try:
        y = float(raw.get("y", 0.0))
    except (TypeError, ValueError):
        y = 0.0
    return (x, y)


def _fallback_position(index: int) -> dict[str, float]:
    col = index % 3
    row = index // 3
    return {"x": float(col * 360), "y": float(row * 220)}


def _centroid_for(
    ids: list[str],
    *,
    pos_by_id: dict[str, tuple[float, float]],
) -> tuple[float, float] | None:
    pts = [pos_by_id[i] for i in ids if i in pos_by_id]
    if not pts:
        return None
    sx = sum(p[0] for p in pts)
    sy = sum(p[1] for p in pts)
    return (sx / len(pts), sy / len(pts))


def _proposal_position(
    *,
    idx: int,
    kind: str,
    target_id: str | None,
    related_ids: list[str],
    pos_by_id: dict[str, tuple[float, float]],
    fallback_index: int,
) -> dict[str, float]:
    # Use related centroid first; fallback to target; then deterministic spread.
    centroid = _centroid_for(related_ids, pos_by_id=pos_by_id)
    if centroid is None and target_id:
        centroid = pos_by_id.get(target_id)
    if centroid is None:
        return _fallback_position(fallback_index + idx)
    x, y = centroid
    # Gentle offsets to avoid full overlap; reposition stays close.
    if kind == "reposition":
        dx = 60.0 if idx % 2 == 0 else -60.0
        dy = 35.0 if (idx // 2) % 2 == 0 else -35.0
    else:
        dx = 160.0 if idx % 2 == 0 else -160.0
        dy = 110.0 if (idx // 2) % 2 == 0 else -110.0
    return {"x": x + dx, "y": y + dy}


def _build_ghost_proposals(
    raw: list[dict[str, Any]],
    *,
    perspectives: list[Perspective],
    max_proposals: int,
) -> list[GhostProposal]:
    if not raw:
        return []
    max_n = max(1, min(max_proposals, 12))
    by_id = {p.perspective_id: p for p in perspectives}
    pos_by_id: dict[str, tuple[float, float]] = {}
    for i, p in enumerate(perspectives):
        x, y = _as_xy(p.position)
        if x == 0.0 and y == 0.0:
            fb = _fallback_position(i)
            x, y = fb["x"], fb["y"]
        pos_by_id[p.perspective_id] = (x, y)

    out: list[GhostProposal] = []
    for idx, item in enumerate(raw[:max_n]):
        kind = str(item.get("proposal_kind", "bridge_card")).strip().lower()
        if kind not in ("reposition", "bridge_card"):
            continue
        target_id = str(item.get("target_perspective_id") or "").strip() or None
        related = [str(x).strip() for x in (item.get("related_perspective_ids") or []) if str(x).strip()]
        related = [x for x in related if x in by_id]
        if target_id and target_id not in by_id:
            target_id = None
        pos = _proposal_position(
            idx=idx,
            kind=kind,
            target_id=target_id,
            related_ids=related,
            pos_by_id=pos_by_id,
            fallback_index=len(pos_by_id),
        )
        if kind == "reposition":
            if not target_id:
                continue
            base = by_id[target_id]
            card = base.model_copy(
                update={
                    "perspective_id": f"ghost_{uuid4()}",
                    "position": pos,
                    "is_ghost": True,
                    "selected": False,
                    "promising": False,
                }
            )
        else:
            desc = str(item.get("description") or item.get("text") or "").strip()
            if not desc:
                continue
            tool = str(item.get("source_tool") or "association").strip() or "association"
            spark_element = str(item.get("spark_element") or "parts").strip() or "parts"
            title = str(item.get("title") or "").strip() or None
            card = Perspective(
                perspective_id=f"ghost_{uuid4()}",
                title=title,
                description=desc,
                text=desc,
                source_tool=tool,
                spark_element=spark_element,
                selected=False,
                promising=False,
                pool_excluded=False,
                position=pos,
                is_ghost=True,
            )
        out.append(
            GhostProposal(
                proposal_kind="reposition" if kind == "reposition" else "bridge_card",
                target_perspective_id=target_id,
                related_perspective_ids=related,
                rationale=str(item.get("rationale") or "").strip() or None,
                card=card,
            )
        )
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
