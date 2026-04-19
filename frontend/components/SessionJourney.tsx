"use client";

import type { CSSProperties } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import type {
  Perspective,
  PerspectivePoolSettings,
  SessionDetail,
  VariationItem,
  WorkflowStep,
} from "@/lib/types";
import { DEFAULT_PERSPECTIVE_POOL } from "@/lib/types";
import {
  addPerspective,
  commitPerspectives,
  deletePerspective,
  generateEnlightenment,
  generateInsights,
  generateInvention,
  generatePerspectivePool,
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
import { sparkRailStatus, workflowProgressPercent } from "@/lib/spark-ui";

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
  const rawStr = raw ?? "";
  if (!rawStr.trim()) return [""];
  if (rawStr.includes("\n") || rawStr.includes("\r")) {
    return rawStr.replace(/\r\n/g, "\n").split("\n");
  }
  const lines = splitBaselineForDisplay(rawStr, field);
  return lines.length ? lines : [""];
}

/** Join baseline editor rows; preserve intentional blank rows (e.g. new line after + Add). */
function joinEditableLines(lines: string[]): string {
  const t = lines.map((l) => l.trimEnd());
  if (t.length === 0) return "";
  if (t.every((x) => x === "")) return "";
  return t.join("\n");
}

function joinPartsLines(lines: string[]): string {
  const t = lines.map((l) => l.trimEnd());
  if (t.every((x) => x === "")) return "";
  return t.join("\n");
}

/**
 * Split Pieces baseline for editing without trimming the whole string (trim would
 * strip trailing newlines and break "+ Add Piece" new rows).
 */
function getPartsEditorLines(raw: string): string[] {
  const v = (raw ?? "").replace(/\r\n/g, "\n");
  if (!v.trim()) return [""];
  if (!v.includes("\n") && (v.includes(";") || v.split(",").length > 3)) {
    const n = normalizeStoredParts(v);
    if (!n.trim()) return [""];
    return n.split("\n");
  }
  return v.split("\n");
}

const BASELINE_ADD_LABELS: Record<(typeof SPARK_FIELDS)[number], string> = {
  situation: "+ Add Situation",
  parts: "+ Add Piece",
  actions: "+ Add Action",
  role: "+ Add Role",
  key_goal: "+ Add Goal",
};

/** Read-only baseline display for section 1 after Generate SPARK (edits happen in transformation). */
function SparkBaselineReadOnly({
  field,
  value,
}: {
  field: (typeof SPARK_FIELDS)[number];
  value: string;
}) {
  const lines = splitBaselineForDisplay(value, field);
  const empty =
    !lines.length || (lines.length === 1 && !(lines[0] ?? "").trim());
  if (empty) {
    return (
      <p className="muted" style={{ margin: 0, fontSize: "0.875rem" }}>
        (empty)
      </p>
    );
  }
  return (
    <div
      className="spark-baseline-readonly"
      style={{
        ...BASELINE_BOX,
        marginBottom: "0.75rem",
        cursor: "default",
        userSelect: "text",
      }}
    >
      {field === "parts" ? (
        <ul style={{ margin: 0, paddingLeft: "1.25rem" }}>
          {lines.map((line, i) => (
            <li key={i} style={{ marginBottom: "0.25rem" }}>
              {line}
            </li>
          ))}
        </ul>
      ) : (
        <div
          style={{
            whiteSpace: "pre-wrap",
            fontSize: "0.9rem",
            lineHeight: 1.5,
          }}
        >
          {lines.join("\n")}
        </div>
      )}
    </div>
  );
}

const BASELINE_LINE_HINTS: Record<(typeof SPARK_FIELDS)[number], string> = {
  situation:
    "One line per beat (context, pressures, backdrop). Add, edit, or remove lines.",
  parts:
    "One piece (noun / entity) per line. Edits here are your baseline for this dimension.",
  actions: "One line per action or verb phrase. Add, edit, or remove lines.",
  role:
    "One line per stakeholder lens (e.g., primary user, operator, decision owner, safety/compliance).",
  key_goal: "One line per goal or success criterion.",
};

const BASELINE_BOX: CSSProperties = {
  marginBottom: "0.75rem",
  padding: "0.6rem 0.75rem",
  borderRadius: "6px",
  border: "1px solid var(--border, rgba(255,255,255,0.12))",
  background: "rgba(127, 127, 127, 0.06)",
};

function AddOrGenerateRow({
  addLabel,
  disabled,
  onAdd,
  onGenerate,
  generateDisabled,
  generateLoading,
}: {
  addLabel: string;
  disabled?: boolean;
  onAdd: () => void;
  onGenerate: () => void;
  generateDisabled?: boolean;
  generateLoading?: boolean;
}) {
  return (
    <div
      className="row"
      style={{
        alignItems: "center",
        flexWrap: "wrap",
        gap: "0.5rem",
        marginTop: "0.35rem",
      }}
    >
      <button
        type="button"
        className="btn-add-line"
        disabled={disabled}
        onClick={onAdd}
      >
        {addLabel}
      </button>
      <span className="muted" style={{ fontSize: "0.85rem" }}>
        or
      </span>
      <button
        type="button"
        className="btn-secondary"
        style={{ fontSize: "0.875rem", padding: "0.4rem 0.75rem" }}
        disabled={disabled || generateDisabled}
        title={
          generateDisabled
            ? "Generate SPARK first."
            : "Generate AI variation lines for this dimension."
        }
        onClick={onGenerate}
      >
        {generateLoading ? "…" : "Generate"}
      </button>
    </div>
  );
}

function SparkLinesListEditor({
  field,
  value,
  onChange,
  disabled,
  onGenerate,
  generateDisabled,
  generateLoading,
}: {
  field: Exclude<(typeof SPARK_FIELDS)[number], "parts">;
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
  onGenerate: () => void;
  generateDisabled?: boolean;
  generateLoading?: boolean;
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
      <AddOrGenerateRow
        addLabel={BASELINE_ADD_LABELS[field]}
        disabled={disabled}
        onAdd={() => onChange(joinEditableLines([...lines, ""]))}
        onGenerate={onGenerate}
        generateDisabled={generateDisabled}
        generateLoading={generateLoading}
      />
    </div>
  );
}

function SparkFieldBaselineEditor({
  field,
  value,
  onChange,
  disabled,
  onGenerate,
  generateDisabled,
  generateLoading,
}: {
  field: (typeof SPARK_FIELDS)[number];
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
  onGenerate: () => void;
  generateDisabled?: boolean;
  generateLoading?: boolean;
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
        {SPARK_LABELS[field]} baseline
      </div>
      <p className="muted" style={{ margin: "0 0 0.5rem", fontSize: "0.8rem" }}>
        Edit the generated baseline here (section 1 shows it read-only). Add,
        change, or remove lines, then save.
      </p>
      {field === "parts" ? (
        <SparkPartsListEditor
          value={value}
          onChange={onChange}
          disabled={disabled}
          onGenerate={onGenerate}
          generateDisabled={generateDisabled}
          generateLoading={generateLoading}
        />
      ) : (
        <SparkLinesListEditor
          field={field}
          value={value}
          onChange={onChange}
          disabled={disabled}
          onGenerate={onGenerate}
          generateDisabled={generateDisabled}
          generateLoading={generateLoading}
        />
      )}
    </div>
  );
}

function SparkPartsListEditor({
  value,
  onChange,
  disabled,
  onGenerate,
  generateDisabled,
  generateLoading,
}: {
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
  onGenerate: () => void;
  generateDisabled?: boolean;
  generateLoading?: boolean;
}) {
  const lines = getPartsEditorLines(value);
  return (
    <div className="stack spark-parts-block">
      <p className="muted" style={{ margin: 0, fontSize: "0.85rem" }}>
        One piece (noun / entity) per line—people, places, objects, systems.
        Replace, remove, add, or combine lines here.
      </p>
      {lines.map((line, i) => (
        <div key={`part-${i}-${lines.length}`} className="variation-line spark-part-line">
          <input
            type="text"
            className="variation-line-input"
            disabled={disabled}
            value={line}
            aria-label={`Piece ${i + 1}`}
            onChange={(e) => {
              const next = [...lines];
              next[i] = e.target.value;
              onChange(joinPartsLines(next));
            }}
          />
          <button
            type="button"
            className="btn-danger-outline"
            disabled={disabled}
            onClick={() => {
              const next = lines.filter((_, j) => j !== i);
              onChange(next.length ? joinPartsLines(next) : "");
            }}
          >
            Remove
          </button>
        </div>
      ))}
      <AddOrGenerateRow
        addLabel={BASELINE_ADD_LABELS.parts}
        disabled={disabled}
        onAdd={() => onChange(joinPartsLines([...lines, ""]))}
        onGenerate={onGenerate}
        generateDisabled={generateDisabled}
        generateLoading={generateLoading}
      />
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
  const errBannerRef = useRef<HTMLDivElement>(null);

  const [sparkEdit, setSparkEdit] = useState<Record<string, string>>({});
  const [problemEdit, setProblemEdit] = useState(initial.problem_statement);
  const [titleEdit, setTitleEdit] = useState(initial.title ?? "");
  const [creativeAi, setCreativeAi] = useState<"openai" | "mock" | null>(null);
  const [poolSettings, setPoolSettings] = useState<PerspectivePoolSettings>(
    () => ({ ...DEFAULT_PERSPECTIVE_POOL }),
  );
  const [activeRail, setActiveRail] = useState<SparkRailKey>("situation");
  const [perspectivePool, setPerspectivePool] = useState<Perspective[]>(
    () => initial.perspectives ?? [],
  );
  const [explorationActive, setExplorationActive] = useState(
    () => (initial.perspectives?.length ?? 0) === 0,
  );
  const [poolSearch, setPoolSearch] = useState("");
  const [poolSort, setPoolSort] = useState<
    "order" | "short" | "long" | "selected"
  >("order");
  const [poolSelectedOnly, setPoolSelectedOnly] = useState(false);
  const [lastPreviewRecommended, setLastPreviewRecommended] = useState<
    string | null
  >(null);

  useEffect(() => {
    void getHealth()
      .then((h) =>
        setCreativeAi(h.creative_ai === "openai" ? "openai" : "mock"),
      )
      .catch(() => setCreativeAi(null));
  }, []);

  useEffect(() => {
    if (err && errBannerRef.current) {
      errBannerRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [err]);

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
    const saved = session.last_perspective_pool;
    if (saved && typeof saved === "object") {
      setPoolSettings({ ...DEFAULT_PERSPECTIVE_POOL, ...saved });
    } else {
      setPoolSettings({ ...DEFAULT_PERSPECTIVE_POOL });
    }
  }, [session.session_id]);

  useEffect(() => {
    setPerspectivePool(initial.perspectives ?? []);
    setExplorationActive((initial.perspectives?.length ?? 0) === 0);
    setPoolSearch("");
    setPoolSort("order");
    setPoolSelectedOnly(false);
    setLastPreviewRecommended(null);
  }, [sessionId]);

  useEffect(() => {
    if (!explorationActive) {
      setPerspectivePool(session.perspectives);
    }
  }, [session.perspectives, explorationActive, session.session_id]);

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

  function patchSessionPerspective(pid: string, patch: Partial<Perspective>) {
    if (explorationActive) {
      setPerspectivePool((prev) =>
        prev.map((x) => (x.perspective_id === pid ? { ...x, ...patch } : x)),
      );
      return;
    }
    setSession((s) => ({
      ...s,
      perspectives: s.perspectives.map((x) =>
        x.perspective_id === pid ? { ...x, ...patch } : x,
      ),
    }));
  }

  async function savePerspectiveText(perspectiveId: string) {
    if (explorationActive) return;
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
    field: "selected" | "promising" | "pool_excluded",
    value: boolean,
  ) {
    const patch: Partial<Perspective> = { [field]: value };
    if (field === "pool_excluded" && value === true) {
      patch.selected = false;
    }
    if (explorationActive) {
      patchSessionPerspective(p.perspective_id, patch);
      return;
    }
    setErr(null);
    setLoading(`pt-${p.perspective_id}-${field}`);
    try {
      const s = await updatePerspective(sessionId, p.perspective_id, {
        ...patch,
      });
      setSession(s);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(null);
    }
  }

  async function removePerspectiveCard(p: Perspective) {
    if (explorationActive) {
      if (!window.confirm("Remove this perspective from your pool?")) return;
      setPerspectivePool((prev) =>
        prev.filter((x) => x.perspective_id !== p.perspective_id),
      );
      return;
    }
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
    if (explorationActive) {
      setPerspectivePool((prev) => [
        ...prev,
        {
          perspective_id: newId(),
          text: "",
          description: "",
          source_tool: "user",
          spark_element: "parts",
          selected: false,
          promising: false,
          pool_excluded: false,
        },
      ]);
      return;
    }
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

  async function runGeneratePerspectives() {
    setErr(null);
    setLoading("persp-gen");
    try {
      const res = await generatePerspectivePool(sessionId, {
        ...poolSettings,
        max_perspectives: 30,
        previewOnly: true,
      });
      setPerspectivePool(res.perspectives);
      setExplorationActive(true);
      setLastPreviewRecommended(res.recommended_perspective ?? null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(null);
    }
  }

  async function runCommitPerspectives() {
    if (perspectivePool.length === 0) return;
    setErr(null);
    setLoading("persp-commit");
    try {
      const s = await commitPerspectives(sessionId, {
        perspectives: perspectivePool,
        perspective_pool: poolSettings,
      });
      setSession(s);
      setPerspectivePool(s.perspectives);
      setExplorationActive(false);
      setLastPreviewRecommended(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(null);
    }
  }

  const displayedPerspectives = useMemo(() => {
    const indexed = perspectivePool.map((p, i) => ({ p, i }));
    let rows = indexed;
    const q = poolSearch.trim().toLowerCase();
    if (q) {
      rows = rows.filter(({ p }) =>
        (p.text || p.description || "").toLowerCase().includes(q),
      );
    }
    if (poolSelectedOnly) {
      rows = rows.filter(({ p }) => p.selected);
    }
    const out = [...rows];
    if (poolSort === "short") {
      out.sort(
        (a, b) =>
          (a.p.text || "").length - (b.p.text || "").length,
      );
    } else if (poolSort === "long") {
      out.sort(
        (a, b) =>
          (b.p.text || "").length - (a.p.text || "").length,
      );
    } else if (poolSort === "selected") {
      out.sort((a, b) => Number(b.p.selected) - Number(a.p.selected));
    } else {
      out.sort((a, b) => a.i - b.i);
    }
    return out.map(({ p }) => p);
  }, [perspectivePool, poolSearch, poolSort, poolSelectedOnly]);

  const perspectivesInPool = session.perspectives.filter((p) => !p.pool_excluded);

  /** Perspectives use SPARK pieces/actions (saved variations optional). */
  const perspectivesAiLocked = session.current_step === "session_created";

  const perspectivesManualLocked = session.current_step === "session_created";

  const canUseVariations = session.current_step !== "session_created";

  /** Match backend generate_insights: if none selected, top 10 in-pool by rank_score are used. */
  const insightsLocked =
    loading !== null ||
    session.current_step === "session_created" ||
    explorationActive ||
    perspectivesInPool.length === 0;

  /** Enable whenever we have saved insights to build from (same gate as backend insight_texts). */
  const inventionLocked =
    loading !== null || (session.insights?.length ?? 0) === 0;

  const inventionLockTitle =
    loading !== null
      ? "Wait for the current action to finish."
      : (session.insights?.length ?? 0) === 0
        ? "Generate insights first — use “Generate insights” in the tray (works with all perspective cards if none are checked)."
        : undefined;

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

  const selectedForTray = explorationActive
    ? []
    : perspectivesInPool.filter((p) => p.selected);
  const promisingForTray = explorationActive
    ? []
    : perspectivesInPool.filter((p) => p.promising);

  const mainColumn = (
    <div className="stack journey-main-col">
      {err ? (
        <div
          ref={errBannerRef}
          className="rounded-lg border border-red-200 bg-red-50/90 px-3 py-2 shadow-sm"
          role="alert"
          aria-live="assertive"
        >
          <p className="error m-0 text-sm font-medium text-red-900">{err}</p>
        </div>
      ) : null}

      <section className="card stack">
        <h2 style={{ margin: 0, fontSize: "1.1rem" }}>Session and problem</h2>
        <p className="muted text-sm" style={{ marginTop: "0.25rem" }}>
          <strong>{stepLabel(session.current_step)}</strong> · iteration{" "}
          {session.current_iteration} · {session.status}
        </p>
        <p className="muted" style={{ marginTop: "0.35rem" }}>
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

      <details className="card stack open">
        <summary
          className="cursor-pointer list-none font-semibold [&::-webkit-details-marker]:hidden"
          style={{ fontSize: "1.1rem" }}
        >
          1. SPARK breakdown
        </summary>
        <div className="mt-3 stack">
        {!session.spark_state ? (
          <p className="muted">
            Define your lens: Situation, Pieces, Actions, Role, Key goal. Generation
            runs on the server (
            {creativeAi === "openai"
              ? "OpenAI"
              : creativeAi === "mock"
                ? "offline templates — add OPENAI_API_KEY for real LLM output"
                : "checking…"}
            ). After generation, this section shows your baseline read-only; edit
            it in <strong>2. SPARK transformation</strong>.
          </p>
        ) : (
          <p className="muted">
            Generated baseline (read-only). To change wording, use{" "}
            <strong>2. SPARK transformation</strong> — the editors there update
            this baseline for the session.
          </p>
        )}
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
                <div className="label">{SPARK_LABELS[f]}</div>
                <SparkBaselineReadOnly field={f} value={sparkEdit[f] ?? ""} />
              </div>
            ))}
          </div>
        ) : null}
        </div>
      </details>

      <details className="card stack open">
        <summary
          className="cursor-pointer list-none font-semibold [&::-webkit-details-marker]:hidden"
          style={{ fontSize: "1.1rem" }}
        >
          2. SPARK transformation
        </summary>
        <div className="mt-3 stack">
        <p className="muted">
          Edit the SPARK baseline per dimension here (section 1 only shows the
          generated snapshot). Change perspective: for <strong>Situation</strong>,
          shift context/constraints; for <strong>Pieces</strong>, replace, remove,
          add, or combine; for <strong>Actions</strong>, reverse, automate, or
          modify; for <strong>Role</strong>, define multiple stakeholder lenses (not
          just one persona); for{" "}
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
              Saves SPARK baseline from transformation (section 2) to the server.
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
                onGenerate={() => void runGenerateForElement(el)}
                generateDisabled={loading !== null || !canUseVariations}
                generateLoading={loading === `var-${el}`}
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
          </div>
        ))}
        </div>
      </details>

      <section
        id="perspective-workspace"
        className="card stack min-h-[min(70vh,920px)] rounded-2xl border-2 border-indigo-100 bg-gradient-to-b from-white to-slate-50/80 p-4 shadow-card sm:p-6"
      >
        <div className="mb-2 flex flex-wrap items-end justify-between gap-2 border-b border-slate-100 pb-3">
          <div>
            <h2 style={{ margin: 0, fontSize: "1.25rem" }} className="text-slate-900">
              Perspective workspace
            </h2>
            <p className="muted mt-1 max-w-3xl text-sm">
              Tune boldness, novelty, and goal priority, then run <strong>one</strong> GenAI batch (up to 30 angles), then
              filter, sort, and select here — all local until you continue. No
              auto-generation when levers change. Role stakeholder lines are used to
              spread perspectives across different lenses.
            </p>
          </div>
          {explorationActive ? (
            <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-900">
              Local draft
            </span>
          ) : (
            <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-900">
              Saved on session
            </span>
          )}
        </div>

        <CreativeLeverPanel
          value={poolSettings}
          onChange={setPoolSettings}
          disabled={loading !== null || perspectivesAiLocked}
        />

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-md hover:bg-indigo-700 disabled:opacity-50"
            disabled={loading !== null || perspectivesAiLocked}
            title={
              perspectivesAiLocked
                ? "Generate SPARK first."
                : "One GenAI call — up to 30 perspectives in your browser only."
            }
            onClick={() => void runGeneratePerspectives()}
          >
            {loading === "persp-gen" ? "…" : "Generate Perspectives"}
          </button>
          <button
            type="button"
            className="btn-secondary rounded-xl px-3 py-2 text-sm"
            disabled={loading !== null || perspectivesManualLocked}
            onClick={() => void addBlankPerspective()}
          >
            {loading === "padd" ? "…" : "Add your own card"}
          </button>
          <span className="text-xs text-slate-500">
            {perspectivePool.length} in pool
            {displayedPerspectives.length !== perspectivePool.length
              ? ` · ${displayedPerspectives.length} shown`
              : ""}
          </span>
        </div>

        {lastPreviewRecommended && explorationActive ? (
          <div
            className="mt-3 rounded-xl border border-indigo-100 bg-indigo-50/80 px-3 py-2 text-sm text-indigo-950"
            role="status"
          >
            <strong className="text-indigo-900">Model note: </strong>
            <span className="whitespace-pre-wrap">{lastPreviewRecommended}</span>
          </div>
        ) : null}

        {session.last_recommended_perspective && !explorationActive ? (
          <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
            <strong className="text-slate-800">Last saved recommendation: </strong>
            {session.last_recommended_perspective}
          </div>
        ) : null}

        <div className="mt-4 flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-3 sm:flex-row sm:flex-wrap sm:items-end">
          <div className="min-w-[12rem] flex-1">
            <label className="label text-xs text-slate-500" htmlFor="pool-search">
              Filter by text
            </label>
            <input
              id="pool-search"
              type="search"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              placeholder="Search perspectives…"
              value={poolSearch}
              onChange={(e) => setPoolSearch(e.target.value)}
            />
          </div>
          <div>
            <label className="label text-xs text-slate-500" htmlFor="pool-sort">
              Sort
            </label>
            <select
              id="pool-sort"
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
              value={poolSort}
              onChange={(e) =>
                setPoolSort(e.target.value as typeof poolSort)
              }
            >
              <option value="order">Original order</option>
              <option value="short">Shortest first</option>
              <option value="long">Longest first</option>
              <option value="selected">Selected first</option>
            </select>
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              checked={poolSelectedOnly}
              onChange={(e) => setPoolSelectedOnly(e.target.checked)}
            />
            Selected only
          </label>
        </div>

        <div
          className="rank-help mt-4 rounded-xl border border-slate-200 bg-slate-50/90 px-3 py-2.5 text-xs leading-relaxed text-slate-700"
          role="note"
        >
          <p className="m-0">
            <strong className="text-slate-900">About Rank</strong> — After you generate
            a pool, each card can show <strong>Rank</strong> as filled stars (★). It
            only compares ideas <em>in that batch</em>: how well the text lines up with
            your problem and SPARK, how well it fits the boldness / novelty / goal you
            picked, plus a little boost for variety.{" "}
            <span className="text-slate-600">
              Hover the stars to see the exact percentage. Use it to spot stronger
              angles first; it is not a grade out of 100 for “correctness.”
            </span>
          </p>
        </div>

        <div className="mt-4 min-h-0 flex-1">
          <PerspectiveCards
            perspectives={displayedPerspectives}
            loading={loading}
            localMode={explorationActive}
            onPatchLocal={patchSessionPerspective}
            onToggleField={togglePerspectiveField}
            onSaveText={(id) => void savePerspectiveText(id)}
            onRemove={removePerspectiveCard}
          />
        </div>

        <div className="sticky bottom-0 z-10 mt-6 border-t border-slate-200 bg-gradient-to-t from-slate-50 to-transparent pt-4">
          <button
            type="button"
            className="w-full rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white shadow-lg hover:bg-slate-800 disabled:opacity-45 sm:w-auto sm:min-w-[280px]"
            disabled={loading !== null || perspectivePool.length === 0}
            onClick={() => void runCommitPerspectives()}
          >
            {loading === "persp-commit"
              ? "…"
              : "Save pool to session"}
          </button>
          <p className="muted mt-2 text-xs">
            Saves every card in your draft with its flags (× not in pool, ★ promising,
            checkbox for insights). Re-open the session to see the same layout. Use
            checkboxes so insights know which angles to prioritize (if none checked,
            the top 10 by rank are used).
          </p>
        </div>
      </section>

      <section
        id="insights-generate"
        className="card stack rounded-2xl border border-slate-200 bg-white p-5 shadow-card"
      >
        <h2 className="text-lg font-semibold text-slate-900">Insights</h2>
        <p className="muted text-sm text-slate-600">
          Synthesize from checked perspectives. If none are checked, the server uses
          the <strong>top 10</strong> in-pool cards by rank. Run this before you build
          an invention. Insight synthesis also looks for stakeholder tensions and
          tradeoffs when those lenses appear in your selected pool.
        </p>
        <button
          type="button"
          className="mt-3 w-full max-w-xs rounded-xl bg-spark-situation py-2.5 text-sm font-semibold text-white shadow-soft disabled:opacity-45 sm:w-auto sm:px-6"
          disabled={insightsLocked}
          title={
            explorationActive
              ? "Save your draft pool in the perspective workspace first."
              : insightsLocked && session.perspectives.length === 0
                ? "Add perspectives first."
                : insightsLocked && perspectivesInPool.length === 0
                  ? "Clear “not in pool” on at least one card, or add perspectives."
                  : "Synthesize from selected perspectives, or top 10 by rank if none checked."
          }
          onClick={() => run("ins", () => generateInsights(sessionId))}
        >
          {loading === "ins" ? "…" : "Generate insights"}
        </button>
      </section>

      <InventionBuilder
        session={session}
        loading={loading}
        inventionLocked={inventionLocked}
        inventionLockTitle={inventionLockTitle}
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
            selectedPerspectives={selectedForTray}
            promisingPerspectives={promisingForTray}
            perspectiveDraftActive={explorationActive}
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
