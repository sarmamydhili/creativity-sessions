"use client";

import { useEffect, useState } from "react";
import type { Perspective, SessionDetail, VariationItem, WorkflowStep } from "@/lib/types";
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

const SPARK_FIELDS = [
  "situation",
  "parts",
  "actions",
  "role",
  "key_goal",
] as const;

const SPARK_LABELS: Record<(typeof SPARK_FIELDS)[number], string> = {
  situation: "Situation",
  parts: "Parts",
  actions: "Actions",
  role: "Role",
  key_goal: "Key goal",
};

const TOOL_LABELS: Record<string, string> = {
  analogy: "Analogy",
  recategorization: "Reframe",
  combination: "Combine",
  association: "Association",
  user: "Your idea",
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

function SparkPartsListEditor({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
}) {
  const lines = value.trim() === "" ? [""] : value.split(/\r?\n/);
  return (
    <div className="stack spark-parts-block">
      <p className="muted" style={{ margin: 0, fontSize: "0.85rem" }}>
        One noun or entity per line (people, places, objects, systems). Edit,
        add, or remove lines.
      </p>
      {lines.map((line, i) => (
        <div key={i} className="variation-line spark-part-line">
          <input
            type="text"
            className="variation-line-input"
            value={line}
            aria-label={`Part ${i + 1}`}
            onChange={(e) => {
              const next = [...lines];
              next[i] = e.target.value;
              onChange(next.join("\n"));
            }}
          />
          <button
            type="button"
            className="btn-danger-outline"
            onClick={() => {
              const next = lines.filter((_, j) => j !== i);
              onChange(next.length ? next.join("\n") : "");
            }}
          >
            Remove
          </button>
        </div>
      ))}
      <button
        type="button"
        className="btn-add-line"
        onClick={() => onChange([...lines, ""].join("\n"))}
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

  /** Perspectives use SPARK parts/actions (saved variations optional). */
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
          Decompose into Situation, Parts, Actions, Role, Key goal. Generation
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
              <div key={f}>
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
        <h2 style={{ margin: 0, fontSize: "1.1rem" }}>2. Variations</h2>
        <p className="muted">
          Each SPARK dimension has its own list (max 6 lines per dimension).{" "}
          <strong>Generate variations</strong> replaces prior AI lines for that
          dimension with a fresh batch and keeps your own lines.{" "}
          <strong>Save</strong> persists variations to the server.
        </p>

        {SPARK_FIELDS.map((el) => (
          <div key={el} className="spark-variation-block">
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
            <p className="muted" style={{ margin: "0.25rem 0 0.5rem", fontSize: "0.85rem" }}>
              {(variationDraft[el] ?? []).length}{" "}
              {(variationDraft[el] ?? []).length === 1 ? "line" : "lines"}
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
          Explore angles on your problem. AI combines <strong>Parts</strong> and{" "}
          <strong>Actions</strong> (from saved variations if present, otherwise
          from your SPARK text). Use after you have generated SPARK.
        </p>
        <div className="row perspective-toolbar">
          <button
            type="button"
            disabled={loading !== null || perspectivesAiLocked}
            title={
              perspectivesAiLocked
                ? "Generate SPARK first."
                : "Create perspective cards from Parts × Actions × creativity tools."
            }
            onClick={() =>
              run("persp", () => generatePerspectives(sessionId, 14))
            }
          >
            {loading === "persp" ? "…" : "Generate perspectives (AI)"}
          </button>
          <button
            type="button"
            className="btn-secondary"
            disabled={loading !== null || perspectivesManualLocked}
            onClick={() => void addBlankPerspective()}
          >
            {loading === "padd" ? "…" : "Add your own card"}
          </button>
        </div>

        {session.perspectives.length === 0 ? (
          <p className="muted">
            No perspective cards yet. Use <strong>Generate perspectives</strong>{" "}
            or add your own.
          </p>
        ) : (
          <div className="perspective-grid">
            {session.perspectives.map((p, idx) => (
              <article key={p.perspective_id} className="perspective-card">
                <div className="perspective-card-top">
                  <span className="perspective-badge">Idea {idx + 1}</span>
                  <span className="perspective-badge subtle">
                    {TOOL_LABELS[p.source_tool] ?? p.source_tool}
                  </span>
                </div>
                <label className="label" htmlFor={`pt-${p.perspective_id}`}>
                  What could this mean for your problem?
                </label>
                <textarea
                  id={`pt-${p.perspective_id}`}
                  rows={4}
                  className="perspective-body-input"
                  value={p.text || p.description || ""}
                  onChange={(e) =>
                    patchSessionPerspective(p.perspective_id, {
                      text: e.target.value,
                      description: e.target.value,
                    })
                  }
                  placeholder="Write a short angle or reframing…"
                />
                {(p.part_ref || p.action_ref) && p.source_tool !== "user" ? (
                  <div className="perspective-chips">
                    {p.part_ref ? (
                      <span className="chip">Part: {p.part_ref}</span>
                    ) : null}
                    {p.action_ref ? (
                      <span className="chip">Action: {p.action_ref}</span>
                    ) : null}
                  </div>
                ) : null}
                <div className="perspective-card-controls">
                  <label className="perspective-check">
                    <input
                      type="checkbox"
                      checked={p.selected}
                      disabled={loading !== null}
                      onChange={(e) =>
                        void togglePerspectiveField(
                          p,
                          "selected",
                          e.target.checked,
                        )
                      }
                    />
                    Use when generating insights
                  </label>
                  <label className="perspective-check">
                    <input
                      type="checkbox"
                      checked={p.promising ?? false}
                      disabled={loading !== null}
                      onChange={(e) =>
                        void togglePerspectiveField(
                          p,
                          "promising",
                          e.target.checked,
                        )
                      }
                    />
                    Promising
                  </label>
                </div>
                <div className="perspective-card-actions">
                  <button
                    type="button"
                    disabled={loading !== null}
                    onClick={() => void savePerspectiveText(p.perspective_id)}
                  >
                    {loading === `psave-${p.perspective_id}` ? "…" : "Save text"}
                  </button>
                  <button
                    type="button"
                    className="btn-danger-outline"
                    disabled={loading !== null}
                    onClick={() => void removePerspectiveCard(p)}
                  >
                    Delete
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="card stack">
        <h2 style={{ margin: 0, fontSize: "1.1rem" }}>4. Insights</h2>
        <p className="muted" style={{ marginTop: 0 }}>
          Requires at least one perspective (from AI or your own card).
        </p>
        <button
          type="button"
          disabled={insightsLocked}
          title={
            insightsLocked && session.perspectives.length === 0
              ? "Add perspectives in section 3 first."
              : "Synthesize insights from selected perspectives (or all if none selected)."
          }
          onClick={() => run("ins", () => generateInsights(sessionId))}
        >
          {loading === "ins" ? "…" : "Generate insights"}
        </button>
        <ul>
          {(session.insights ?? []).map((ins) => (
            <li key={ins.insight_id}>{ins.text}</li>
          ))}
        </ul>
      </section>

      <section className="card stack">
        <h2 style={{ margin: 0, fontSize: "1.1rem" }}>5. Invention</h2>
        <p className="muted" style={{ marginTop: 0 }}>
          Run after you have generated insights.
        </p>
        <button
          type="button"
          disabled={inventionLocked}
          title={
            inventionLocked && !(session.insights && session.insights.length)
              ? "Generate insights in section 4 first."
              : "Propose one invention concept from your insights."
          }
          onClick={() => run("inv", () => generateInvention(sessionId))}
        >
          {loading === "inv" ? "…" : "Generate invention"}
        </button>
        {session.invention ? (
          <div>
            <h3>{session.invention.title}</h3>
            <p>{session.invention.description}</p>
            <p className="muted">{session.invention.benefits}</p>
            <p className="muted">{session.invention.next_steps}</p>
          </div>
        ) : null}
        {(session.inventions?.length ?? 0) > 1 ? (
          <div className="muted" style={{ fontSize: "0.85rem" }}>
            {session.inventions!.length} invention(s) recorded in this session
            (latest shown above).
          </div>
        ) : null}
      </section>

      <section className="card stack">
        <h2 style={{ margin: 0, fontSize: "1.1rem" }}>6. Enlightenment</h2>
        <button
          type="button"
          disabled={loading !== null}
          onClick={() => run("enl", () => generateEnlightenment(sessionId))}
        >
          {loading === "enl" ? "…" : "Generate enlightenment"}
        </button>
        {session.enlightenment ? (
          <div>
            <p>{session.enlightenment.summary}</p>
            <ul>
              {session.enlightenment.principles.map((x, i) => (
                <li key={i}>{x}</li>
              ))}
            </ul>
            <p className="muted">{session.enlightenment.applies_elsewhere}</p>
          </div>
        ) : null}
      </section>
    </div>
  );

  return (
    <div className="journey-page">
      <div className="journey-layout">
        {mainColumn}
        <aside className="journey-history-aside">
          <details className="card history-details">
            <summary className="history-summary">Interaction history</summary>
            <div className="history-body">
              <HistoryTimeline entries={session.history} />
            </div>
          </details>
        </aside>
      </div>
    </div>
  );
}
