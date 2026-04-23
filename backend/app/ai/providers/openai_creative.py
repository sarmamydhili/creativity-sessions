from __future__ import annotations

import json
import re
from typing import Any
from uuid import uuid4

import httpx

from app.ai.prompts import templates as prompt_templates
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
from app.services.creative_lever_prompt_builder import (
    build_lever_system_prompt,
    build_lever_user_prompt,
)
from app.services.perspective_pool_allocation import (
    SUBTYPES_BY_TOOL,
    build_allocation_slots,
)
from app.services.perspective_pool_prompt import build_perspective_pool_user_prompt

OPENAI_CHAT_URL = "https://api.openai.com/v1/chat/completions"


def _strip_key(key: str) -> str:
    return key.strip().strip('"').strip("'")


def _extract_json_object(text: str) -> dict[str, Any]:
    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
    m = re.search(r"\{[\s\S]*\}", text)
    if not m:
        raise ValueError("No JSON object in model response")
    return json.loads(m.group())


def _normalize_pool_tool_slug(raw: str) -> str:
    t = (raw or "analogy").lower().strip().replace(" ", "_").replace("-", "_")
    if t in ("re_categorization", "recategorisation"):
        return "recategorization"
    if t in ("analogy", "recategorization", "combination", "association"):
        return t
    return "analogy"


def _normalize_pool_spark_element(raw: str) -> str:
    t = (raw or "parts").lower().strip().replace(" ", "_")
    if t == "keygoal" or t == "key-goal":
        return "key_goal"
    if t in ("situation", "parts", "actions", "role", "key_goal"):
        return t
    return "parts"


def _normalize_pool_subtype(tool: str, raw: str | None) -> str | None:
    t = (raw or "").strip().lower().replace(" ", "_").replace("-", "_")
    if not t:
        return None
    allowed = SUBTYPES_BY_TOOL.get(tool, ())
    if t in allowed:
        return t
    # tolerate minor variants
    for a in allowed:
        if t.replace("_", "") == a.replace("_", ""):
            return a
    return None


def _align_pool_row(p: Perspective, slot: dict[str, str]) -> Perspective:
    tool = slot["tool"]
    allowed = SUBTYPES_BY_TOOL.get(tool, ())
    model_subtype = _normalize_pool_subtype(tool, getattr(p, "subtype", None))
    subtype = model_subtype if model_subtype in allowed else slot["subtype"]
    return p.model_copy(update={"source_tool": tool, "subtype": subtype})


def _perspective_from_pool_item(it: dict[str, Any]) -> Perspective | None:
    if not isinstance(it, dict):
        return None
    pid_raw = it.get("id")
    pid = str(pid_raw).strip() if pid_raw else str(uuid4())
    title = str(it.get("title", "")).strip()
    desc = str(it.get("description", "")).strip()
    why = str(it.get("why_it_is_interesting", "")).strip()
    parts = [p for p in (title, desc, why) if p]
    body = "\n\n".join(parts) if parts else ""
    if not body.strip():
        return None
    tool = _normalize_pool_tool_slug(str(it.get("tool_used", "analogy")))
    el = _normalize_pool_spark_element(str(it.get("spark_element", "parts")))
    return Perspective(
        perspective_id=pid,
        title=title or None,
        description=desc or body,
        text=body,
        source_tool=tool,
        spark_element=el,
        why_interesting=why or None,
        boldness_level=str(it.get("boldness_level", "")).strip() or None,
        novelty_level=str(it.get("novelty_level", "")).strip() or None,
        goal_priority_alignment=str(it.get("goal_priority_alignment", "")).strip() or None,
        selected=False,
    )


def _clean_spark_field(text: str) -> str:
    """Drop meta-instruction echoes and duplicate lines some models still emit."""
    t = (text or "").strip()
    if not t:
        return ""
    t = re.sub(
        r"(?is)\bconcrete nouns and components suggested by your wording:\s*",
        "",
        t,
    )
    t = re.sub(r"(?is)\balso consider:\s*", "", t)
    lines = [ln.strip() for ln in t.replace("\r\n", "\n").split("\n") if ln.strip()]
    uniq: list[str] = []
    seen: set[str] = set()
    for ln in lines:
        if ln not in seen:
            seen.add(ln)
            uniq.append(ln)
    return "\n".join(uniq) if len(uniq) > 1 else (uniq[0] if uniq else "")


def _normalize_spark_parts_value(text: str) -> str:
    """One noun/entity per line; split legacy comma/semicolon lists."""
    t = _clean_spark_field(text)
    if not t:
        return ""
    if "\n" in t:
        return t
    if t.count(";") >= 1:
        return "\n".join(x.strip() for x in t.split(";") if x.strip())
    if t.count(",") >= 2:
        return "\n".join(x.strip() for x in t.split(",") if x.strip())
    return t


class OpenAICreativeProvider(CreativeProvider):
    """OpenAI Chat Completions API implementing the full SPARK workflow."""

    def __init__(self, *, api_key: str, model: str) -> None:
        self._api_key = _strip_key(api_key)
        self._model = model.strip() or "gpt-4o-mini"

    async def _chat_json(self, *, system: str, user: str, temperature: float = 0.7) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "model": self._model,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            "temperature": temperature,
        }
        # json_object is supported by recent OpenAI chat models
        payload["response_format"] = {"type": "json_object"}

        headers = {
            "Authorization": f"Bearer {self._api_key}",
            "Content-Type": "application/json",
        }
        async with httpx.AsyncClient(timeout=120.0) as client:
            r = await client.post(OPENAI_CHAT_URL, headers=headers, json=payload)
            r.raise_for_status()
            body = r.json()
        text = body["choices"][0]["message"]["content"] or "{}"
        return _extract_json_object(text)

    async def spark_breakdown(
        self,
        *,
        problem_statement: str,
        title: str | None,
        extra_context: str | None,
    ) -> SparkState:
        system = prompt_templates.SPARK_SYSTEM
        user = json.dumps(
            {
                "title": title,
                "problem_statement": problem_statement,
                "extra_context": extra_context,
            },
            ensure_ascii=False,
        )
        raw = await self._chat_json(system=system, user=user)
        return SparkState(
            situation=_clean_spark_field(str(raw.get("situation", ""))),
            parts=_normalize_spark_parts_value(str(raw.get("parts", ""))),
            actions=_clean_spark_field(str(raw.get("actions", ""))),
            role=_clean_spark_field(str(raw.get("role", ""))),
            key_goal=_clean_spark_field(str(raw.get("key_goal", ""))),
        )

    async def variations_for_elements(
        self,
        *,
        spark: SparkState,
        elements: list[str],
    ) -> dict[str, list[str]]:
        system = prompt_templates.VARIATIONS_SYSTEM
        user = json.dumps(
            {
                "spark": spark.model_dump(),
                "elements": elements,
            },
            ensure_ascii=False,
        )
        raw = await self._chat_json(system=system, user=user)
        var_map = raw.get("variations") or raw
        out: dict[str, list[str]] = {}
        if isinstance(var_map, dict):
            for k, v in var_map.items():
                if isinstance(v, list):
                    cleaned = [str(x).strip() for x in v if str(x).strip()]
                    out[str(k)] = cleaned[:6]
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
        system = prompt_templates.PERSPECTIVES_MATRIX_SYSTEM
        user = json.dumps(
            {
                "problem_statement": problem_statement,
                "spark": spark.model_dump(),
                "parts_candidates": parts_candidates,
                "actions_candidates": actions_candidates,
                "max_perspectives": max_perspectives,
            },
            ensure_ascii=False,
        )
        raw = await self._chat_json(system=system, user=user)
        items = raw.get("perspectives")
        if not isinstance(items, list):
            items = []
        out: list[Perspective] = []
        for it in items:
            if not isinstance(it, dict):
                continue
            txt = str(it.get("text") or it.get("description", ""))
            out.append(
                Perspective(
                    perspective_id=str(uuid4()),
                    description=txt,
                    text=txt,
                    source_tool=str(it.get("source_tool", "analogy")),
                    spark_element=str(it.get("spark_element", "parts+actions")),
                    part_ref=it.get("part_ref"),
                    action_ref=it.get("action_ref"),
                    selected=False,
                )
            )
        return out[:max_perspectives]

    async def perspectives_with_creative_levers(
        self,
        *,
        problem_statement: str,
        spark: SparkState,
        levers: CreativeLevers,
        num_outputs: int,
    ) -> tuple[list[Perspective], str, list[str]]:
        system = build_lever_system_prompt()
        user = build_lever_user_prompt(
            problem=problem_statement,
            spark=spark,
            levers=levers,
            num_outputs=num_outputs,
        )
        raw = await self._chat_json(system=system, user=user)
        items = raw.get("perspectives")
        if not isinstance(items, list):
            items = []
        out: list[Perspective] = []
        for it in items:
            if not isinstance(it, dict):
                continue
            txt = str(it.get("text") or it.get("description", "")).strip()
            if not txt:
                continue
            out.append(
                Perspective(
                    perspective_id=str(uuid4()),
                    description=txt,
                    text=txt,
                    source_tool=str(it.get("source_tool", "analogy")),
                    spark_element=str(it.get("spark_element", "parts")),
                    part_ref=it.get("part_ref"),
                    action_ref=it.get("action_ref"),
                    selected=False,
                )
            )
        rec = str(raw.get("recommended_perspective", "")).strip()
        if not rec and out:
            rec = out[0].text
        ins_raw = raw.get("insight_candidates")
        insight_candidates: list[str] = []
        if isinstance(ins_raw, list):
            insight_candidates = [str(x).strip() for x in ins_raw if str(x).strip()]
        return out[:num_outputs], rec, insight_candidates

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
        system = prompt_templates.PERSPECTIVE_POOL_SYSTEM
        cap = max(1, min(max_perspectives, 32))
        slots = build_allocation_slots(cap)
        user = build_perspective_pool_user_prompt(
            problem_statement=problem_statement,
            spark=spark,
            boldness=boldness,
            novelty=novelty,
            goal_priority=goal_priority,
            max_perspectives=max_perspectives,
        )
        raw = await self._chat_json(system=system, user=user)
        items = raw.get("perspectives")
        if not isinstance(items, list):
            items = []
        out: list[Perspective] = []
        for it in items:
            p = _perspective_from_pool_item(it) if isinstance(it, dict) else None
            if p is not None:
                out.append(p)
        out = out[: len(slots)]
        out = [_align_pool_row(p, slots[i]) for i, p in enumerate(out) if i < len(slots)]
        rec: str | None = None
        if out:
            rec = (out[0].title or out[0].text or "").strip() or None
        insight_candidates: list[str] = []
        ins_raw = raw.get("insight_candidates")
        if isinstance(ins_raw, list):
            insight_candidates = [str(x).strip() for x in ins_raw if str(x).strip()]
        if not insight_candidates and out:
            insight_candidates = [
                f"Compare two perspectives that optimize {goal_priority.value.replace('_', ' ')} differently.",
                "Pick one perspective to prototype with minimal scope.",
            ]
        return out, rec, insight_candidates

    async def insights_from_perspectives(
        self,
        *,
        spark: SparkState,
        perspectives: list[Perspective],
        problem_statement: str = "",
        theme_groups: list[dict[str, Any]] | None = None,
    ) -> list[dict[str, Any]]:
        system = prompt_templates.INSIGHTS_SYSTEM
        themes = theme_groups or []
        user = json.dumps(
            {
                "problem_statement": problem_statement,
                "spark": spark.model_dump(),
                "themes": themes,
                "perspectives_reference": [p.model_dump() for p in perspectives],
            },
            ensure_ascii=False,
        )
        raw = await self._chat_json(system=system, user=user, temperature=0.55)
        ins = raw.get("insights")
        if not isinstance(ins, list):
            return []
        out: list[dict[str, Any]] = []
        for item in ins:
            if isinstance(item, str):
                t = str(item).strip()
                if t:
                    out.append(
                        {
                            "text": t,
                            "why_it_matters": "",
                            "theme_index": 0,
                            "source_perspective_ids": [],
                        }
                    )
                continue
            if not isinstance(item, dict):
                continue
            text = str(item.get("text", "")).strip()
            if not text:
                continue
            sip = item.get("source_perspective_ids")
            if not isinstance(sip, list):
                sip = []
            ti = item.get("theme_index", 0)
            try:
                theme_index = int(ti)
            except (TypeError, ValueError):
                theme_index = 0
            tl = str(item.get("theme_label", "")).strip()
            out.append(
                {
                    "text": text,
                    "why_it_matters": str(item.get("why_it_matters", "")).strip(),
                    "theme_index": theme_index,
                    "source_perspective_ids": [str(x).strip() for x in sip if str(x).strip()],
                    "theme_label": tl or None,
                }
            )
        return out

    async def stakeholder_feature_cards_from_perspectives(
        self,
        *,
        spark: SparkState,
        perspectives: list[Perspective],
        stakeholders: list[str],
        problem_statement: str = "",
        max_cards: int = 24,
    ) -> list[dict[str, Any]]:
        if not perspectives or not stakeholders:
            return []
        system = prompt_templates.STAKEHOLDER_FEATURE_CARDS_SYSTEM
        user = json.dumps(
            {
                "problem_statement": problem_statement,
                "spark": spark.model_dump(),
                "stakeholders": stakeholders,
                "max_cards": max(4, min(max_cards, 64)),
                "perspectives_reference": [p.model_dump() for p in perspectives],
            },
            ensure_ascii=False,
        )
        raw = await self._chat_json(system=system, user=user, temperature=0.5)
        cards = raw.get("feature_cards")
        if not isinstance(cards, list):
            return []
        out: list[dict[str, Any]] = []
        allowed_stakeholders = {s.strip().lower(): s.strip() for s in stakeholders if s.strip()}
        perspective_ids = {p.perspective_id for p in perspectives}
        for item in cards:
            if not isinstance(item, dict):
                continue
            stakeholder_raw = str(item.get("stakeholder") or "").strip()
            stakeholder = allowed_stakeholders.get(stakeholder_raw.lower())
            if not stakeholder:
                continue
            feature_type = str(item.get("feature_type") or "functional").strip().lower()
            if feature_type not in ("functional", "technical"):
                feature_type = "functional"
            title = str(item.get("title") or "").strip()
            description = str(item.get("description") or "").strip()
            if not title or not description:
                continue
            spids = [
                str(x).strip()
                for x in (item.get("source_perspective_ids") or [])
                if str(x).strip() and str(x).strip() in perspective_ids
            ]
            if not spids:
                continue
            priority = str(item.get("priority") or "").strip().lower()
            if priority not in ("high", "medium", "low"):
                priority = "medium"
            out.append(
                {
                    "stakeholder": stakeholder,
                    "feature_type": feature_type,
                    "title": title[:90],
                    "description": description[:400],
                    "why_it_matters": str(item.get("why_it_matters") or "").strip()[:240],
                    "source_perspective_ids": spids,
                    "priority": priority,
                }
            )
            if len(out) >= max(4, min(max_cards, 64)):
                break
        return out

    async def propose_perspective_changes(
        self,
        *,
        problem_statement: str,
        spark: SparkState,
        perspectives: list[Perspective],
        max_proposals: int,
    ) -> list[dict[str, Any]]:
        if not perspectives:
            return []
        system = prompt_templates.PROPOSE_CHANGES_SYSTEM
        user = json.dumps(
            {
                "problem_statement": problem_statement,
                "max_proposals": max(1, min(max_proposals, 12)),
                "spark": spark.model_dump(),
                "perspectives": [
                    {
                        "perspective_id": p.perspective_id,
                        "title": p.title,
                        "text": p.text or p.description,
                        "source_tool": p.source_tool,
                        "spark_element": p.spark_element,
                        "position": p.position,
                    }
                    for p in perspectives
                ],
            },
            ensure_ascii=False,
        )
        raw = await self._chat_json(system=system, user=user, temperature=0.45)
        arr = raw.get("proposals")
        if not isinstance(arr, list):
            return []
        out: list[dict[str, Any]] = []
        for item in arr:
            if not isinstance(item, dict):
                continue
            kind = str(item.get("proposal_kind", "")).strip().lower()
            if kind not in ("reposition", "bridge_card"):
                continue
            proposal: dict[str, Any] = {
                "proposal_kind": kind,
                "target_perspective_id": str(item.get("target_perspective_id") or "").strip() or None,
                "related_perspective_ids": [
                    str(x).strip()
                    for x in (item.get("related_perspective_ids") or [])
                    if str(x).strip()
                ],
                "rationale": str(item.get("rationale") or "").strip() or None,
            }
            if kind == "bridge_card":
                txt = str(item.get("description") or item.get("text") or "").strip()
                if not txt:
                    continue
                proposal.update(
                    {
                        "title": str(item.get("title") or "").strip() or None,
                        "description": txt,
                        "source_tool": _normalize_pool_tool_slug(str(item.get("source_tool", "association"))),
                        "spark_element": _normalize_pool_spark_element(str(item.get("spark_element", "parts"))),
                    }
                )
            out.append(proposal)
            if len(out) >= max(1, min(max_proposals, 12)):
                break
        return out

    async def invention_from_inputs(
        self,
        *,
        spark: SparkState,
        selected_or_top_perspectives: list[str],
        stakeholder_feature_cards: list[str],
        insight_signals: list[str] | None = None,
    ) -> InventionArtifact:
        system = prompt_templates.INVENTION_SYSTEM
        user = json.dumps(
            {
                "spark": spark.model_dump(),
                "selected_or_top_perspectives": selected_or_top_perspectives,
                "stakeholder_feature_cards": stakeholder_feature_cards,
                "insight_signals": insight_signals or [],
            },
            ensure_ascii=False,
        )
        raw = await self._chat_json(system=system, user=user)
        product_name = str(raw.get("product_name") or raw.get("title") or "").strip()
        what_is_it = str(raw.get("what_is_it") or raw.get("description") or "").strip()
        why_does_it_exist = str(raw.get("why_does_it_exist") or "").strip()
        who_is_it_for = str(raw.get("who_is_it_for") or "").strip()
        value_provided = str(raw.get("value_provided") or raw.get("benefits") or "").strip()
        core_caps_raw = raw.get("core_capabilities")
        core_capabilities: list[str] = []
        if isinstance(core_caps_raw, list):
            core_capabilities = [str(x).strip() for x in core_caps_raw if str(x).strip()][:3]
        how_is_it_different = str(raw.get("how_is_it_different") or "").strip()
        business_goal = str(raw.get("business_goal") or "").strip()
        success_looks_like = str(raw.get("success_looks_like") or "").strip()
        future_potential = str(raw.get("future_potential") or raw.get("next_steps") or "").strip()
        description = (
            f"What is it? {what_is_it}\n\n"
            f"Why does it exist? {why_does_it_exist}\n\n"
            f"Who is it for? {who_is_it_for}\n\n"
            f"What value does it provide? {value_provided}\n\n"
            f"How is it different? {how_is_it_different}\n\n"
            f"Business Goal: {business_goal}\n\n"
            f"Success Looks Like: {success_looks_like}\n\n"
            f"Future Potential: {future_potential}"
        ).strip()
        return InventionArtifact(
            title=product_name,
            description=description,
            benefits=value_provided,
            next_steps=future_potential,
            product_name=product_name,
            what_is_it=what_is_it,
            why_does_it_exist=why_does_it_exist,
            who_is_it_for=who_is_it_for,
            value_provided=value_provided,
            core_capabilities=core_capabilities,
            how_is_it_different=how_is_it_different,
            business_goal=business_goal,
            success_looks_like=success_looks_like,
            future_potential=future_potential,
        )

    async def enlightenment_from_work(
        self,
        *,
        spark: SparkState,
        insights: list[str],
        invention: InventionArtifact,
    ) -> EnlightenmentArtifact:
        system = prompt_templates.ENLIGHTENMENT_SYSTEM
        user = json.dumps(
            {
                "spark": spark.model_dump(),
                "insights": insights,
                "invention": invention.model_dump(),
            },
            ensure_ascii=False,
        )
        raw = await self._chat_json(system=system, user=user, temperature=0.5)
        principles = raw.get("principles")
        if not isinstance(principles, list):
            principles = []
        return EnlightenmentArtifact(
            summary=str(raw.get("summary", "")),
            principles=[str(p).strip() for p in principles if str(p).strip()],
            applies_elsewhere=str(raw.get("applies_elsewhere", "")),
        )
