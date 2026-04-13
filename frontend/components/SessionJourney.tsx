"use client";

import type { CSSProperties } from "react";
import { useEffect, useState } from "react";
import type {
  CreativeLevers,
  Perspective,
  SessionDetail,
  VariationItem,
  WorkflowStep,
} from "@/lib/types";
import { DEFAULT_CREATIVE_LEVERS } from "@/lib/types";
import {
  addPerspective,
  deletePerspective,
  generateEnlightenment,
  generateInsights,
  generateInvention,
  generatePerspectives,
  generateSpark,
  generateVariations,
  getHealth,
  patchSession,
  patchSpark,
  persistVariations,
  updatePerspective,
} from "@/lib/api";
import { HistoryTimeline } from "@/components/HistoryTimeline";
import { CreativeLeverPanel } from "@/components/CreativeLeverPanel";
import { EnlightenmentView } from "@/components/EnlightenmentView";
import { InventionBuilder } from "@/components/InventionBuilder";
import { InsightsTray } from "@/components/InsightsTray";
import { PerspectiveCards } from "@/components/PerspectiveCards";
import { SPARKRail } from "@/components/SPARKRail";
import { SPARKWorkspace } from "@/components/SPARKWorkspace";
import type { SparkRailKey } from "@/lib/spark-ui";
import {
  suggestedNextMove,
  sparkRailStatus,
  workflowProgressPercent,
} from "@/lib/spark-ui";

const SPARK_FIELDS = [
  "situation",
  "parts",
  "actions",
  "role",
  "key_goal",
] as const;

const SPARK_LABELS: Record<(typeof SPARK_FIELDS)[number], string> = {
  situation: "Situation",
  parts: "Pieces",
  actions: "Actions",
  role: "Role",
  key_goal: "Key goal",
};

function newId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `v_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function normalizeVariations(
  raw: SessionDetail["variations"] | undefined,
): Record<string, VariationItem[]> {
  const out: Record<string, VariationItem[]> = {};
  for (const f of SPARK_FIELDS) {
    out[f] = [];
  }
  if (!raw) return out;
  for (const [key, items] of Object.entries(raw)) {
    if (!Array.isArray(items)) continue;
    out[key] = items.map((item) => {
      if (typeof item === "string") {
        return {
          variation_id: newId(),
          element: key,
          text: item,
          source: "generated" as const,
        };
      }
      return {
        variation_id: item.variation_id || newId(),
        element: item.element || key,
        text: item.text ?? "",
        source: item.source === "user" ? "user" : "generated",
      };
    });
  }
  return out;
}

function stepLabel(s: WorkflowStep): string {
  return s.replace(/_/g, " ");
}

function isSessionDetail(x: unknown): x is SessionDetail {
  return typeof x === "object" && x !== null && "session_id" in x;
}

/** Prefer one part per line; migrate legacy semicolon/comma lists from the API */
function normalizeStoredParts(s: string): string {
  const t = (s ?? "").trim();
  if (!t) return "";
  if (t.includes("\n")) return t;
  if (t.includes(";")) {
    return t
      .split(";")
      .map((x) => x.trim())
      .filter(Boolean)
      .join("\n");
  }
  if (t.split(",").length > 3) {
    return t
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean)
      .join("\n");
  }
  return t;
}

/** Lines to display for Pieces (same rules as step 1 editor). */
function splitNormalizedPiecesLines(raw: string): string[] {
  const n = normalizeStoredParts(raw);
  if (!n.trim()) return [];
  return n.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
}

/** Baseline text split for display (Pieces uses normalized lines; others use newlines or ;). */
function splitBaselineForDisplay(
  raw: string,
  field: (typeof SPARK_FIELDS)[number],
): string[] {
  if (field === "parts") {
    return splitNormalizedPiecesLines(raw);
  }
  const t = (raw ?? "").trim();
  if (!t) return [];
  if (t.includes("\n")) {
    return t.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  }
  const bySemi = t.split(";").map((s) => s.trim()).filter(Boolean);
  if (bySemi.length > 1) {
    return bySemi;
  }
  return [t];
}

/** Lines for editable baseline controls (at least one row). */
function getEditableLines(
  raw: string,
  field: (typeof SPARK_FIELDS)[number],
): string[] {
  if (field === "parts") {
    const n = normalizeStoredParts(raw);
    return n.trim() === "" ? [""] : n.split(/\r?\n/);
  }
  const lines = splitBaselineForDisplay(raw, field);
  return lines.length ? lines : [""];
}

function joinEditableLines(lines: string[]): string {
  const t = lines.map((l) => l.trimEnd());
  while (t.length > 1 && t[t.length - 1] === "") {
    t.pop();
  }
  return t.join("\n");
}

const BASELINE_LINE_HINTS: Record<(typeof SPARK_FIELDS)[number], string> = {
  situation:
    "One line per beat (context, pressures, backdrop). Add, edit, or remove lines.",
  parts:
    "One piece (noun / entity) per line. Same as section 1; edits stay in sync.",
  actions: "One line per action or verb phrase. Add, edit, or remove lines.",
  role: "One line per role, hat, or stakeholder.",
  key_goal: "One line per goal or success criterion.",
};

const BASELINE_BOX: CSSProperties = {
  marginBottom: "0.75rem",
  padding: "0.6rem 0.75rem",
  borderRadius: "6px",
  border: "1px solid var(--border, rgba(255,255,255,0.12))",
  background: "rgba(127, 127, 127, 0.06)",
};

function SparkLinesListEditor({
  field,
  value,
  onChange,
  disabled,
}: {
  field: Exclude<(typeof SPARK_FIELDS)[number], "parts">;
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
}) {
  const lines = getEditableLines(value, field);
  return (
    <div className="stack spark-baseline-lines">
      <p className="muted" style={{ margin: 0, fontSize: "0.85rem" }}>
        {BASELINE_LINE_HINTS[field]}
      </p>
      {lines.map((line, i) => (
        <div key={`${field}-${i}`} className="variation-line spark-baseline-line">
          <input
            type="text"
            className="variation-line-input"
            disabled={disabled}
            value={line}
            aria-label={`${SPARK_LABELS[field]} line ${i + 1}`}
            onChange={(e) => {
              const next = [...lines];
              next[i] = e.target.value;
              onChange(joinEditableLines(next));
            }}
          />
          <button
            type="button"
            className="btn-danger-outline"
            disabled={disabled}
            onClick={() => {
              const next = lines.filter((_, j) => j !== i);
              onChange(next.length ? joinEditableLines(next) : "");
            }}
          >
            Remove
          </button>
        </div>
      ))}
      <button
        type="button"
        className="btn-add-line"
        disabled={disabled}
        onClick={() => onChange(joinEditableLines([...lines, ""]))}
      >
        + Add line
      </button>
    </div>
  );
}

function SparkFieldBaselineEditor({
  field,
  value,
  onChange,
  disabled,
}: {
  field: (typeof SPARK_FIELDS)[number];
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="spark-baseline-ref" style={BASELINE_BOX}>
      <div
        className="muted"
        style={{
          fontSize: "0.8rem",
          fontWeight: 600,
          marginBottom: "0.25rem",
        }}
      >
        {SPARK_LABELS[field]} baseline (step 1)
      </div>
      <p className="muted" style={{ margin: "0 0 0.5rem", fontSize: "0.8rem" }}>
        Edit the saved SPARK text here or in section 1—same data. Add, change, or
        remove lines, then save.
      </p>
      {field === "parts" ? (
        <SparkPartsListEditor
          value={value}
          onChange={onChange}
          disabled={disabled}
        />
      ) : (
        <SparkLinesListEditor
          field={field}
          value={value}
          onChange={onChange}
          disabled={disabled}
        />
      )}
    </div>
  );
}

function SparkPartsListEditor({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
}) {
  const normalized = normalizeStoredParts(value);
  const lines =
    normalized.trim() === "" ? [""] : normalized.split(/\r?\n/);
  return (
    <div className="stack spark-parts-block">
      <p className="muted" style={{ margin: 0, fontSize: "0.85rem" }}>
        One piece (noun / entity) per line—people, places, objects, systems.
        Replace, remove, add, or combine lines here.
      </p>
      {lines.map((line, i) => (
        <div key={i} className="variation-line spark-part-line">
          <input
            type="text"
            className="variation-line-input"
            disabled={disabled}
            value={line}
            aria-label={`Piece ${i + 1}`}
            onChange={(e) => {
              const next = [...lines];
              next[i] = e.target.value;
              onChange(joinEditableLines(next));
            }}
          />
          <button
            type="button"
            className="btn-danger-outline"
            disabled={disabled}
            onClick={() => {
              const next = lines.filter((_, j) => j !== i);
              onChange(next.length ? joinEditableLines(next) : "");
            }}
          >
            Remove
          </button>
        </div>
      ))}
      <button
        type="button"
        className="btn-add-line"
        disabled={disabled}
        onClick={() => onChange(joinEditableLines([...lines, ""]))}
      >
        + Add part
      </button>
    </div>
  );
}

export function SessionJourney({
  initial,
  sessionId,
  onSessionChange,
}: {
  initial: SessionDetail;
  sessionId: string;
  /** Keeps parent header (title) in sync when problem/title is saved inside the journey. */
  onSessionChange?: (s: SessionDetail) => void;
}) {
  const [session, setSession] = useState(initial);
  const [variationDraft, setVariationDraft] = useState(() =>
    normalizeVariations(initial.variations),
  );
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState<string | null>(null);

  const [sparkEdit, setSparkEdit] = useState<Record<string, string>>({});
  const [problemEdit, setProblemEdit] = useState(initial.problem_statement);
  const [titleEdit, setTitleEdit] = useState(initial.title ?? "");
  const [creativeAi, setCreativeAi] = useState<"openai" | "mock" | null>(null);
  const [creativeLevers, setCreativeLevers] = useState<CreativeLevers>(() => ({
    ...DEFAULT_CREATIVE_LEVERS,
  }));
  const [activeRail, setActiveRail] = useState<SparkRailKey>("situation");
  const [compareMode, setCompareMode] = useState(false);

  useEffect(() => {
    void getHealth()
      .then((h) =>
        setCreativeAi(h.creative_ai === "openai" ? "openai" : "mock"),
      )
      .catch(() => setCreativeAi(null));
  }, []);

  useEffect(() => {
    setVariationDraft(normalizeVariations(session.variations));
  }, [session.session_id]);

  useEffect(() => {
    setProblemEdit(session.problem_statement);
    setTitleEdit(session.title ?? "");
  }, [session.session_id, session.problem_statement, session.title]);

  useEffect(() => {
    onSessionChange?.(session);
  }, [session, onSessionChange]);

  useEffect(() => {
    if (session.spark_state) {
      const sp = session.spark_state;
      setSparkEdit({
        situation: sp.situation,
        parts: normalizeStoredParts(sp.parts ?? ""),
        actions: sp.actions,
        role: sp.role,
        key_goal: sp.key_goal,
      });
    }
  }, [session.spark_state]);

  useEffect(() => {
    const saved = session.last_creative_levers;
    if (saved && typeof saved === "object") {
      const tool =
        saved.tool ??
        (saved as { cognitive_tool?: CreativeLevers["tool"] }).cognitive_tool ??
        DEFAULT_CREATIVE_LEVERS.tool;
      setCreativeLevers({ ...DEFAULT_CREATIVE_LEVERS, ...saved, tool });
    } else {
      setCreativeLevers({ ...DEFAULT_CREATIVE_LEVERS });
    }
  }, [session.session_id]);

  async function run<T>(key: string, fn: () => Promise<T>) {
    setErr(null);
    setLoading(key);
    try {
      const res = await fn();
      if (res && typeof res === "object") {
        if ("session" in res && (res as { session: SessionDetail }).session) {
          setSession((res as { session: SessionDetail }).session);
        } else if (isSessionDetail(res)) {
          setSession(res);
        }
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(null);
    }
  }

  async function runGenerateForElement(el: string) {
    setErr(null);
    setLoading(`var-${el}`);
    try {
      const res = await generateVariations(sessionId, [el], variationDraft);
      setVariationDraft(normalizeVariations(res.merged_variations));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(null);
    }
  }

  async function runPersistVariations(sourceEl: string) {
    setErr(null);
    setLoading(`varp-${sourceEl}`);
    try {
      const s = await persistVariations(sessionId, variationDraft);
      setSession(s);
      setVariationDraft(normalizeVariations(s.variations));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(null);
    }
  }

  function updateLine(
    element: string,
    variationId: string,
    text: string,
  ) {
    setVariationDraft((prev) => ({
      ...prev,
      [element]: (prev[element] ?? []).map((v) =>
        v.variation_id === variationId ? { ...v, text, source: "user" } : v,
      ),
    }));
  }

  function removeLine(element: string, variationId: string) {
    setVariationDraft((prev) => ({
      ...prev,
      [element]: (prev[element] ?? []).filter((v) => v.variation_id !== variationId),
    }));
  }

  function addLine(element: string) {
    setVariationDraft((prev) => ({
      ...prev,
      [element]: [
        ...(prev[element] ?? []),
        {
          variation_id: newId(),
          element,
          text: "",
          source: "user",
        },
      ],
    }));
  }

  function patchSessionPerspective(pid: string, patch: Partial<Perspective>) {
    setSession((s) => ({
      ...s,
      perspectives: s.perspectives.map((x) =>
        x.perspective_id === pid ? { ...x, ...patch } : x,
      ),
    }));
  }

  async function savePerspectiveText(perspectiveId: string) {
    const p = session.perspectives.find((x) => x.perspective_id === perspectiveId);
    if (!p) return;
    setErr(null);
    setLoading(`psave-${perspectiveId}`);
    try {
      const s = await updatePerspective(sessionId, perspectiveId, {
        text: p.text || p.description || "",
      });
      setSession(s);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(null);
    }
  }

  async function togglePerspectiveField(
    p: Perspective,
    field: "selected" | "promising",
    value: boolean,
  ) {
    setErr(null);
    setLoading(`pt-${p.perspective_id}-${field}`);
    try {
      const s = await updatePerspective(sessionId, p.perspective_id, {
        [field]: value,
      });
      setSession(s);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(null);
    }
  }

  async function removePerspectiveCard(p: Perspective) {
    if (!window.confirm("Remove this perspective?")) return;
    setErr(null);
    setLoading(`pdel-${p.perspective_id}`);
    try {
      const s = await deletePerspective(sessionId, p.perspective_id);
      setSession(s);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(null);
    }
  }

  async function addBlankPerspective() {
    setErr(null);
    setLoading("padd");
    try {
      const s = await addPerspective(sessionId, "");
      setSession(s);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(null);
    }
  }

  /** Perspectives use SPARK pieces/actions (saved variations optional). */
  const perspectivesAiLocked = session.current_step === "session_created";

  const perspectivesManualLocked = session.current_step === "session_created";

  const canUseVariations = session.current_step !== "session_created";

  const insightsLocked =
    loading !== null ||
    session.current_step === "session_created" ||
    session.perspectives.length === 0;

  const inventionLocked =
    loading !== null ||
    session.current_step === "session_created" ||
    !(session.insights && session.insights.length > 0);

  const selectedPerspectives = session.perspectives.filter((p) => p.selected);

  function handleRailSelect(key: SparkRailKey) {
    setActiveRail(key);
    const v = document.querySelector(
      `[data-spark-phase="variation"][data-spark-anchor="${key}"]`,
    );
    const b = document.querySelector(
      `[data-spark-phase="baseline"][data-spark-anchor="${key}"]`,
    );
    (v || b)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function jumpToInvention() {
    document.getElementById("invention-builder")?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }

  const mainColumn = (
    <div className="stack journey-main-col">
      <div className="card">
        <div className="muted">Current step</div>
        <strong>{stepLabel(session.current_step)}</strong> · iteration{" "}
        {session.current_iteration} · status {session.status}
      </div>

      {err ? (
        <p className="error" role="alert" aria-live="polite">
          {err}
        </p>
      ) : null}

      <section className="card stack">
        <h2 style={{ margin: 0, fontSize: "1.1rem" }}>Problem</h2>
        <p className="muted" style={{ marginTop: 0 }}>
          Describe the challenge you are working on. You can revise it anytime;
          later steps use the latest saved version.
        </p>
        <div>
          <label className="label" htmlFor="session-title">
            Title (optional)
          </label>
          <input
            id="session-title"
            type="text"
            value={titleEdit}
            onChange={(e) => setTitleEdit(e.target.value)}
            placeholder="e.g. Jogger hydration challenge"
          />
        </div>
        <div>
          <label className="label" htmlFor="session-problem">
            Problem statement
          </label>
          <textarea
            id="session-problem"
            rows={5}
            value={problemEdit}
            onChange={(e) => setProblemEdit(e.target.value)}
            placeholder="What problem or opportunity are you exploring?"
          />
        </div>
        <button
          type="button"
          disabled={loading !== null || !problemEdit.trim()}
          onClick={() =>
            run("prob", () =>
              patchSession(sessionId, {
                problem_statement: problemEdit.trim(),
                title: titleEdit.trim() ? titleEdit.trim() : null,
              }),
            )
          }
        >
          {loading === "prob" ? "…" : "Save problem"}
        </button>
      </section>

      <section className="card stack">
        <h2 style={{ margin: 0, fontSize: "1.1rem" }}>1. SPARK breakdown</h2>
        <p className="muted">
          Define your lens: Situation, Pieces, Actions, Role, Key goal. Generation
          runs on the server (
          {creativeAi === "openai"
            ? "OpenAI"
            : creativeAi === "mock"
              ? "offline templates — add OPENAI_API_KEY for real LLM output"
              : "checking…"}
          ).
        </p>
        {creativeAi === "mock" ? (
          <p
            className="muted"
            style={{
              marginTop: 0,
              padding: "0.5rem 0.75rem",
              borderLeft: "3px solid #f59e0b",
              background: "rgba(245, 158, 11, 0.08)",
            }}
            role="status"
          >
            SPARK uses offline heuristics because no API key is configured. Set{" "}
            <code>OPENAI_API_KEY</code> in <code>backend/.env</code> (or{" "}
            <code>.env.dev</code>) and restart the API for full LLM generation.
          </p>
        ) : null}
        <button
          type="button"
          disabled={loading !== null}
          title={
            creativeAi === "openai"
              ? "Calls OpenAI to fill the five SPARK fields from your saved problem."
              : "Fills SPARK from offline templates (configure OPENAI_API_KEY for OpenAI)."
          }
          onClick={() =>
            run("spark", () => generateSpark(sessionId, { extra_context: null }))
          }
        >
          {loading === "spark" ? "…" : "Generate SPARK"}
        </button>

        {session.spark_state ? (
          <div className="stack">
            {SPARK_FIELDS.map((f) => (
              <div key={f} data-spark-anchor={f} data-spark-phase="baseline">
                <label className="label" htmlFor={f === "parts" ? undefined : f}>
                  {SPARK_LABELS[f]}
                </label>
                {f === "parts" ? (
                  <SparkPartsListEditor
                    value={sparkEdit.parts ?? ""}
                    onChange={(next) =>
                      setSparkEdit((s) => ({ ...s, parts: next }))
                    }
                  />
                ) : (
                  <textarea
                    id={f}
                    rows={f === "situation" || f === "key_goal" ? 4 : 3}
                    value={sparkEdit[f] ?? ""}
                    onChange={(e) =>
                      setSparkEdit((s) => ({ ...s, [f]: e.target.value }))
                    }
                  />
                )}
              </div>
            ))}
            <button
              type="button"
              disabled={loading !== null}
              onClick={() =>
                run("patch", () => patchSpark(sessionId, { ...sparkEdit }))
              }
            >
              {loading === "patch" ? "…" : "Save SPARK edits"}
            </button>
          </div>
        ) : null}
      </section>

      <section className="card stack">
        <h2 style={{ margin: 0, fontSize: "1.1rem" }}>2. SPARK transformation</h2>
        <p className="muted">
          Change perspective per element: for <strong>Situation</strong>, shift
          context/constraints; for <strong>Pieces</strong>, replace, remove,
          add, or combine; for <strong>Actions</strong>, reverse, automate, or
          modify; for <strong>Role</strong>, change identity or user type; for{" "}
          <strong>Key goal</strong>, change the objective or metric. Max 6 lines
          per dimension. <strong>Generate variations</strong> refreshes AI lines;
          <strong>Save</strong> persists.
        </p>
        {session.spark_state ? (
          <div className="row" style={{ marginBottom: "0.5rem", flexWrap: "wrap", gap: "0.5rem" }}>
            <button
              type="button"
              disabled={loading !== null}
              onClick={() =>
                run("patch", () => patchSpark(sessionId, { ...sparkEdit }))
              }
            >
              {loading === "patch" ? "…" : "Save SPARK baseline"}
            </button>
            <span className="muted" style={{ fontSize: "0.85rem" }}>
              Saves baseline fields (section 1 and step 2) to the server.
            </span>
          </div>
        ) : null}

        {SPARK_FIELDS.map((el) => (
          <div
            key={el}
            className="spark-variation-block"
            data-spark-anchor={el}
            data-spark-phase="variation"
          >
            <div className="spark-variation-head">
              <h3 className="spark-variation-title">{SPARK_LABELS[el]}</h3>
              <div className="row spark-variation-actions">
                <button
                  type="button"
                  disabled={loading !== null || !canUseVariations}
                  title={
                    canUseVariations
                      ? "Generate a fresh batch of variation lines for this SPARK dimension."
                      : "Generate SPARK first (step 1), then you can add variations here."
                  }
                  onClick={() => void runGenerateForElement(el)}
                >
                  {loading === `var-${el}` ? "…" : "Generate variations"}
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={loading !== null || !canUseVariations}
                  title={
                    canUseVariations
                      ? "Save all variation lines to the server."
                      : "Generate SPARK first before saving variations."
                  }
                  onClick={() => void runPersistVariations(el)}
                >
                  {loading?.startsWith("varp-") ? "…" : "Save"}
                </button>
              </div>
            </div>
            {session.spark_state ? (
              <SparkFieldBaselineEditor
                field={el}
                value={sparkEdit[el] ?? ""}
                onChange={(next) =>
                  setSparkEdit((s) => ({ ...s, [el]: next }))
                }
                disabled={loading !== null}
              />
            ) : null}
            <p className="muted" style={{ margin: "0.25rem 0 0.5rem", fontSize: "0.85rem" }}>
              {(variationDraft[el] ?? []).length}{" "}
              {(variationDraft[el] ?? []).length === 1 ? "line" : "lines"}{" "}
              (variation ideas below)
            </p>
            {(variationDraft[el] ?? []).map((row) => (
              <div
                key={row.variation_id}
                className="variation-line"
              >
                <span className="variation-source">{row.source}</span>
                <textarea
                  rows={2}
                  className="variation-line-input"
                  value={row.text}
                  onChange={(e) =>
                    updateLine(el, row.variation_id, e.target.value)
                  }
                />
                <button
                  type="button"
                  className="btn-danger-outline"
                  onClick={() => removeLine(el, row.variation_id)}
                >
                  Remove
                </button>
              </div>
            ))}
            <button
              type="button"
              className="btn-add-line"
              onClick={() => addLine(el)}
            >
              + Add your own line
            </button>
          </div>
        ))}
      </section>

      <section className="card stack">
        <h2 style={{ margin: 0, fontSize: "1.1rem" }}>3. Perspectives</h2>
        <p className="muted">
          Explore angles on your problem. Use <strong>creative levers</strong> to
          steer GenAI reframing, or the classic flow that combines{" "}
          <strong>Pieces</strong> × <strong>Actions</strong> × creativity tools
          (from saved variations when present). Requires SPARK from step 1.
        </p>
        <CreativeLeverPanel
          value={creativeLevers}
          onChange={setCreativeLevers}
          disabled={loading !== null || perspectivesAiLocked}
        />
        <div className="row perspective-toolbar" style={{ flexWrap: "wrap", gap: "0.5rem" }}>
          <button
            type="button"
            disabled={loading !== null || perspectivesAiLocked}
            title={
              perspectivesAiLocked
                ? "Generate SPARK first."
                : "Generate perspectives using your lever settings (count follows divergence: 3 / 5 / 8, capped by max)."
            }
            onClick={() =>
              run("persp-lev", () =>
                generatePerspectives(sessionId, 16, creativeLevers),
              )
            }
          >
            {loading === "persp-lev" ? "…" : "Generate with creative levers"}
          </button>
          <button
            type="button"
            className="btn-secondary"
            disabled={loading !== null || perspectivesAiLocked}
            title={
              perspectivesAiLocked
                ? "Generate SPARK first."
                : "Legacy: Pieces × Actions × creativity tools matrix."
            }
            onClick={() =>
              run("persp", () => generatePerspectives(sessionId, 14, null))
            }
          >
            {loading === "persp" ? "…" : "Classic matrix (Pieces × Actions)"}
          </button>
          <button
            type="button"
            className="btn-secondary"
            disabled={loading !== null || perspectivesManualLocked}
            onClick={() => void addBlankPerspective()}
          >
            {loading === "padd" ? "…" : "Add your own card"}
          </button>
          <button
            type="button"
            className="btn-secondary"
            disabled={loading !== null || perspectivesAiLocked}
            title="Pick a random SPARK target and generate with your other levers."
            onClick={() => {
              const next = {
                ...creativeLevers,
                spark_target: "Surprise Me" as const,
              };
              setCreativeLevers(next);
              void run("persp-surprise", () =>
                generatePerspectives(sessionId, 16, next),
              );
            }}
          >
            {loading === "persp-surprise" ? "…" : "Surprise me"}
          </button>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              checked={compareMode}
              onChange={(e) => setCompareMode(e.target.checked)}
            />
            Compare view
          </label>
        </div>
        {(session.last_recommended_perspective ||
          (session.last_insight_candidates &&
            session.last_insight_candidates.length > 0)) && (
          <div
            style={{
              marginTop: "0.75rem",
              padding: "0.65rem 0.75rem",
              borderRadius: "6px",
              border: "1px solid var(--border, rgba(255,255,255,0.12))",
              background: "rgba(59, 130, 246, 0.06)",
            }}
          >
            <div className="muted" style={{ fontSize: "0.8rem", marginBottom: "0.35rem" }}>
              Lever run output (persisted on the session)
            </div>
            {session.last_recommended_perspective ? (
              <div style={{ marginBottom: "0.5rem" }}>
                <strong style={{ fontSize: "0.85rem" }}>Recommended perspective</strong>
                <p style={{ margin: "0.25rem 0 0", whiteSpace: "pre-wrap" }}>
                  {session.last_recommended_perspective}
                </p>
              </div>
            ) : null}
            {session.last_insight_candidates &&
            session.last_insight_candidates.length > 0 ? (
              <div>
                <strong style={{ fontSize: "0.85rem" }}>Insight candidates</strong>
                <ul style={{ margin: "0.35rem 0 0", paddingLeft: "1.25rem" }}>
                  {session.last_insight_candidates.map((line, i) => (
                    <li key={i} style={{ marginBottom: "0.2rem" }}>
                      {line}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        )}

        <PerspectiveCards
          perspectives={session.perspectives}
          loading={loading}
          compareMode={compareMode}
          onPatchLocal={patchSessionPerspective}
          onToggleField={togglePerspectiveField}
          onSaveText={(id) => void savePerspectiveText(id)}
          onRemove={removePerspectiveCard}
        />
      </section>

      <InventionBuilder
        session={session}
        loading={loading}
        inventionLocked={inventionLocked}
        onGenerate={() => run("inv", () => generateInvention(sessionId))}
      />

      <EnlightenmentView
        session={session}
        loading={loading}
        onGenerate={() => run("enl", () => generateEnlightenment(sessionId))}
      />
    </div>
  );

  return (
    <div className="journey-page mx-auto w-full max-w-[1600px] px-2 pb-8 sm:px-4">
      <SPARKWorkspace
        rail={
          <SPARKRail
            activeKey={activeRail}
            onSelect={handleRailSelect}
            statusFor={(key) => sparkRailStatus(session, activeRail, key)}
          />
        }
        center={mainColumn}
        tray={
          <InsightsTray
            session={session}
            progressPercent={workflowProgressPercent(session.current_step)}
            nextHint={suggestedNextMove(session)}
            selectedPerspectives={selectedPerspectives}
            insightsLocked={insightsLocked}
            inventionLocked={inventionLocked}
            loading={loading}
            onGenerateInsights={() =>
              run("ins", () => generateInsights(sessionId))
            }
            onGenerateInvention={() =>
              run("inv", () => generateInvention(sessionId))
            }
            onGenerateEnlightenment={() =>
              run("enl", () => generateEnlightenment(sessionId))
            }
            onJumpToInvention={jumpToInvention}
          />
        }
        footer={
          <details className="card history-details rounded-2xl border border-slate-200 bg-white shadow-card">
            <summary className="history-summary cursor-pointer px-4 py-3 text-sm font-semibold text-slate-800">
              Thinking trail · interaction history
            </summary>
            <div className="history-body px-4 pb-4">
              <HistoryTimeline entries={session.history} />
            </div>
          </details>
        }
      />
    </div>
  );
}
