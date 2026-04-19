from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from fastapi import HTTPException, status

from app.models.creative_levers import CreativeLevers
from app.models.perspective_pool import PerspectivePoolSettings
from app.models.session import (
    EnlightenmentArtifact,
    HistoryEntry,
    HistoryEventKind,
    InsightRecord,
    InventionArtifact,
    Perspective,
    SessionCreate,
    SessionDetail,
    SessionListResponse,
    SessionStatus,
    SessionSummary,
    SessionUpdateRequest,
    SparkState,
    VariationItem,
    WorkflowStep,
)
from app.repositories.session_repository import SessionRepository


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _normalize_doc(doc: dict[str, Any]) -> dict[str, Any]:
    """Backfill fields for older session documents."""
    d = dict(doc)
    if "problem_statement" not in d or not d.get("problem_statement"):
        d["problem_statement"] = d.get("theme") or ""
    if "title" not in d:
        d["title"] = d.get("title")
    if "status" not in d:
        d["status"] = SessionStatus.active.value
    if "current_step" not in d:
        cs = d.get("current_stage")
        if cs == "spark":
            d["current_step"] = WorkflowStep.spark_generated.value
        elif cs == "refine":
            d["current_step"] = WorkflowStep.variations_generated.value
        elif cs == "deliver":
            d["current_step"] = WorkflowStep.enlightenment_generated.value
        else:
            d["current_step"] = WorkflowStep.session_created.value
    if "current_iteration" not in d:
        d["current_iteration"] = 1
    if "variations" not in d or d["variations"] is None:
        d["variations"] = {}
    if "tool_applications" not in d or d["tool_applications"] is None:
        d["tool_applications"] = []
    if "perspectives" not in d or d["perspectives"] is None:
        d["perspectives"] = []
    if "insights" not in d or d["insights"] is None:
        d["insights"] = []
    if "invention" not in d:
        d["invention"] = None
    if "inventions" not in d or d["inventions"] is None:
        d["inventions"] = []
    if "enlightenment" not in d:
        d["enlightenment"] = None
    if "deleted" not in d:
        d["deleted"] = False
    if "last_creative_levers" not in d:
        d["last_creative_levers"] = None
    if "last_perspective_pool" not in d:
        d["last_perspective_pool"] = None
    if "last_recommended_perspective" not in d:
        d["last_recommended_perspective"] = None
    if "last_insight_candidates" not in d:
        d["last_insight_candidates"] = []
    return d


def _parse_perspective(raw: dict[str, Any]) -> Perspective:
    desc = raw.get("description") or raw.get("text") or ""
    text = raw.get("text") or desc
    rs_raw = raw.get("rank_score")
    rank_score: float | None = None
    if rs_raw is not None and rs_raw != "":
        try:
            rank_score = float(rs_raw)
        except (TypeError, ValueError):
            rank_score = None
    pos_raw = raw.get("position")
    x = 0.0
    y = 0.0
    if isinstance(pos_raw, dict):
        try:
            x = float(pos_raw.get("x", 0.0))
        except (TypeError, ValueError):
            x = 0.0
        try:
            y = float(pos_raw.get("y", 0.0))
        except (TypeError, ValueError):
            y = 0.0
    return Perspective(
        perspective_id=raw.get("perspective_id") or str(uuid4()),
        description=desc,
        text=text,
        iteration=int(raw.get("iteration", 1)),
        source_tool=raw.get("source_tool", ""),
        spark_element=raw.get("spark_element", ""),
        part_ref=raw.get("part_ref"),
        action_ref=raw.get("action_ref"),
        selected=bool(raw.get("selected", False)),
        promising=bool(raw.get("promising", False)),
        pool_excluded=bool(raw.get("pool_excluded", False)),
        title=raw.get("title"),
        why_interesting=raw.get("why_interesting"),
        boldness_level=raw.get("boldness_level"),
        novelty_level=raw.get("novelty_level"),
        goal_priority_alignment=raw.get("goal_priority_alignment"),
        subtype=raw.get("subtype"),
        rank_score=rank_score,
        position={"x": x, "y": y},
        is_ghost=bool(raw.get("is_ghost", False)),
    )


def _parse_variations_from_raw(raw: Any) -> dict[str, list[VariationItem]]:
    if not raw or not isinstance(raw, dict):
        return {}
    out: dict[str, list[VariationItem]] = {}
    for key, val in raw.items():
        if not isinstance(val, list):
            continue
        items: list[VariationItem] = []
        for x in val:
            if isinstance(x, str):
                if not x.strip():
                    continue
                items.append(
                    VariationItem(
                        variation_id=str(uuid4()),
                        element=key,
                        text=x.strip(),
                        source="generated",
                    )
                )
            elif isinstance(x, dict):
                src = x.get("source", "generated")
                if src not in ("generated", "user"):
                    src = "generated"
                items.append(
                    VariationItem(
                        variation_id=x.get("variation_id") or str(uuid4()),
                        element=str(x.get("element", key)),
                        text=str(x.get("text", "")),
                        source=src,  # type: ignore[arg-type]
                    )
                )
        out[key] = items
    return out


def _parse_insights(raw: Any) -> list[InsightRecord]:
    if not raw:
        return []
    out: list[InsightRecord] = []
    for item in raw:
        if isinstance(item, str):
            out.append(InsightRecord(insight_id=str(uuid4()), iteration=1, text=item))
        elif isinstance(item, dict):
            why = str(item.get("why_it_matters") or "").strip()
            tl = str(item.get("theme_label") or "").strip()
            out.append(
                InsightRecord(
                    insight_id=item.get("insight_id", str(uuid4())),
                    iteration=int(item.get("iteration", 1)),
                    text=item.get("text", ""),
                    why_it_matters=why or None,
                    source_perspective_ids=list(item.get("source_perspective_ids") or []),
                    source_tools=list(item.get("source_tools") or []),
                    source_spark_elements=list(item.get("source_spark_elements") or []),
                    theme_label=tl or None,
                )
            )
    return out


def _parse_invention(raw: Any) -> InventionArtifact | None:
    if raw is None:
        return None
    if isinstance(raw, dict):
        return InventionArtifact(
            title=raw.get("title", ""),
            description=raw.get("description", ""),
            benefits=raw.get("benefits", ""),
            next_steps=raw.get("next_steps", ""),
        )
    return None


def _parse_inventions(raw: Any) -> list[InventionArtifact]:
    if not raw or not isinstance(raw, list):
        return []
    out: list[InventionArtifact] = []
    for x in raw:
        inv = _parse_invention(x)
        if inv is not None:
            out.append(inv)
    return out


def _parse_enlightenment(raw: Any) -> EnlightenmentArtifact | None:
    if raw is None:
        return None
    if isinstance(raw, dict):
        return EnlightenmentArtifact(
            summary=raw.get("summary", ""),
            principles=list(raw.get("principles") or []),
            applies_elsewhere=raw.get("applies_elsewhere", ""),
        )
    return None


def _doc_to_detail(doc: dict[str, Any]) -> SessionDetail:
    d = _normalize_doc(doc)
    history: list[HistoryEntry] = []
    for h in d.get("history", []):
        if not isinstance(h, dict):
            continue
        try:
            kind = HistoryEventKind(h["kind"])
        except ValueError:
            kind = HistoryEventKind.user_note
        history.append(
            HistoryEntry(
                entry_id=h.get("entry_id") or str(uuid4()),
                kind=kind,
                payload=h.get("payload", {}),
                created_at=h["created_at"],
            )
        )
    spark_raw = d.get("spark_state")
    spark_state: SparkState | None = None
    if isinstance(spark_raw, dict):
        spark_state = SparkState(**{k: spark_raw.get(k, "") for k in SparkState.model_fields})
    perspectives = [_parse_perspective(p) for p in d.get("perspectives", []) if isinstance(p, dict)]
    insights = _parse_insights(d.get("insights"))
    invention = _parse_invention(d.get("invention"))
    inventions = _parse_inventions(d.get("inventions"))
    if not inventions and invention is not None:
        inventions = [invention]
    if invention is None and inventions:
        invention = inventions[-1]
    enlightenment = _parse_enlightenment(d.get("enlightenment"))

    last_creative_levers: CreativeLevers | None = None
    raw_levers = d.get("last_creative_levers")
    if isinstance(raw_levers, dict):
        try:
            last_creative_levers = CreativeLevers.model_validate(raw_levers)
        except Exception:
            last_creative_levers = None
    last_perspective_pool: PerspectivePoolSettings | None = None
    raw_pool = d.get("last_perspective_pool")
    if isinstance(raw_pool, dict):
        try:
            last_perspective_pool = PerspectivePoolSettings.model_validate(raw_pool)
        except Exception:
            last_perspective_pool = None
    last_rec = d.get("last_recommended_perspective")
    last_rec_str = str(last_rec).strip() if last_rec else None
    last_ins_raw = d.get("last_insight_candidates") or []
    last_insight_candidates: list[str] = []
    if isinstance(last_ins_raw, list):
        last_insight_candidates = [str(x).strip() for x in last_ins_raw if str(x).strip()]

    return SessionDetail(
        session_id=d["session_id"],
        title=d.get("title"),
        problem_statement=d["problem_statement"],
        status=SessionStatus(d["status"]),
        current_step=WorkflowStep(d["current_step"]),
        updated_at=d["updated_at"],
        current_iteration=int(d.get("current_iteration", 1)),
        spark_state=spark_state,
        variations=_parse_variations_from_raw(d.get("variations")),
        tool_applications=list(d.get("tool_applications") or []),
        last_creative_levers=last_creative_levers,
        last_perspective_pool=last_perspective_pool,
        last_recommended_perspective=last_rec_str,
        last_insight_candidates=last_insight_candidates,
        perspectives=perspectives,
        insights=insights,
        invention=invention,
        inventions=inventions,
        enlightenment=enlightenment,
        history=history,
        created_at=d["created_at"],
        owner_id=d.get("owner_id"),
        deleted=bool(d.get("deleted")),
        deleted_at=d.get("deleted_at"),
    )


def _doc_to_summary(doc: dict[str, Any]) -> SessionSummary:
    d = _normalize_doc(doc)
    return SessionSummary(
        session_id=d["session_id"],
        title=d.get("title"),
        problem_statement=d["problem_statement"],
        status=SessionStatus(d["status"]),
        current_step=WorkflowStep(d["current_step"]),
        updated_at=d["updated_at"],
    )


class SessionService:
    def __init__(self, repo: SessionRepository) -> None:
        self._repo = repo

    async def create_session(self, body: SessionCreate) -> SessionDetail:
        session_id = str(uuid4())
        now = _utcnow()
        title = body.title
        if not title:
            ps = body.problem_statement.strip()
            title = (ps[:47] + "…") if len(ps) > 50 else ps
        entry = HistoryEntry(
            kind=HistoryEventKind.session_created,
            payload={"title": title, "problem_statement": body.problem_statement},
            created_at=now,
        )
        doc: dict[str, Any] = {
            "session_id": session_id,
            "title": title,
            "problem_statement": body.problem_statement,
            "owner_id": body.owner_id,
            "status": SessionStatus.active.value,
            "current_step": WorkflowStep.session_created.value,
            "current_iteration": 1,
            "spark_state": None,
            "variations": {},
            "tool_applications": [],
            "perspectives": [],
            "insights": [],
            "invention": None,
            "inventions": [],
            "enlightenment": None,
            "deleted_at": None,
            "deleted": False,
            "history": [entry.model_dump(mode="python")],
            "created_at": now,
            "updated_at": now,
        }
        await self._repo.insert_session(doc)
        loaded = await self._repo.find_by_session_id(session_id)
        assert loaded is not None
        return _doc_to_detail(loaded)

    async def get_session(self, session_id: str) -> SessionDetail:
        doc = await self._repo.find_by_session_id(session_id)
        if doc is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
        return _doc_to_detail(doc)

    async def list_sessions(
        self,
        owner_id: str | None,
        limit: int,
        skip: int,
    ) -> SessionListResponse:
        total = await self._repo.count_sessions(owner_id)
        docs = await self._repo.list_sessions(owner_id, limit, skip)
        items = [_doc_to_summary(d) for d in docs]
        return SessionListResponse(items=items, total=total)

    def to_detail(self, doc: dict[str, Any]) -> SessionDetail:
        return _doc_to_detail(doc)

    async def patch_session(self, session_id: str, body: SessionUpdateRequest) -> SessionDetail:
        doc = await self._repo.find_by_session_id(session_id)
        if doc is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
        data = body.model_dump(exclude_unset=True)
        set_fields: dict[str, Any] = {}
        if "problem_statement" in data:
            set_fields["problem_statement"] = str(data["problem_statement"]).strip()
        if "title" in data:
            set_fields["title"] = data["title"]
        hist = HistoryEntry(
            kind=HistoryEventKind.problem_edited,
            payload={"fields": list(data.keys())},
            created_at=_utcnow(),
        )
        out = await self._repo.append_history_and_set(
            session_id,
            hist.model_dump(mode="python"),
            set_fields,
        )
        assert out is not None
        return _doc_to_detail(out)

    async def delete_session(self, session_id: str) -> None:
        deleted = await self._repo.delete_by_session_id(session_id)
        if not deleted:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
