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
        cap = max(1, min(max_perspectives, 32))
        out = out[:cap]
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
    ) -> list[str]:
        system = prompt_templates.INSIGHTS_SYSTEM
        user = json.dumps(
            {
                "spark": spark.model_dump(),
                "perspectives": [p.model_dump() for p in perspectives],
            },
            ensure_ascii=False,
        )
        raw = await self._chat_json(system=system, user=user)
        ins = raw.get("insights")
        if not isinstance(ins, list):
            return []
        return [str(x).strip() for x in ins if str(x).strip()]

    async def invention_from_insights(
        self,
        *,
        spark: SparkState,
        insights: list[str],
    ) -> InventionArtifact:
        system = prompt_templates.INVENTION_SYSTEM
        user = json.dumps(
            {"spark": spark.model_dump(), "insights": insights},
            ensure_ascii=False,
        )
        raw = await self._chat_json(system=system, user=user)
        return InventionArtifact(
            title=str(raw.get("title", "")),
            description=str(raw.get("description", "")),
            benefits=str(raw.get("benefits", "")),
            next_steps=str(raw.get("next_steps", "")),
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
