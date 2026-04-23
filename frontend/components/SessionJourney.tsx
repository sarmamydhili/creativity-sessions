"use client";

import type { CSSProperties } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import type {
  GhostProposal,
  Perspective,
  PerspectivePoolSettings,
  SessionDetail,
  StakeholderFeatureCard,
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
  generateStakeholderFeatureCards,
  generateVariations,
  getHealth,
  patchSession,
  patchSpark,
  proposeChanges,
  persistVariations,
  selectStakeholderFeatureCards,
  updatePerspective,
} from "@/lib/api";
import { CreativeLeverPanel } from "@/components/CreativeLeverPanel";
import { EnlightenmentView } from "@/components/EnlightenmentView";
import { InventionBuilder } from "@/components/InventionBuilder";
import { PerspectiveCanvas } from "@/components/PerspectiveCanvas";
import { SPARKRail } from "@/components/SPARKRail";
import { SPARKWorkspace } from "@/components/SPARKWorkspace";
import { suggestedNextMove, workflowProgressPercent } from "@/lib/spark-ui";
import {
  deliverableLabel,
  projectTypeLabel,
  type ExperienceMode,
  type ProjectType,
} from "@/lib/experience";

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

type ArrangeMode = "tool" | "theme";
type FlowStepKey =
  | "problem"
  | "challenge"
  | "ideaBoard"
  | "generateIdeas"
  | "refinePicks"
  | "canvas"
  | "stakeholderCards"
  | "insights"
  | "shapeConcept"
  | "buildConcept";

type IndexedPerspective = {
  p: Perspective;
  i: number;
};
type XY = { x: number; y: number };

const TOOL_ORDER = ["analogy", "recategorization", "combination", "association"] as const;
const LANE_X_STEP = 380;
const ROW_Y_STEP = 230;
const LANE_BASE_X = 40;
const ROW_BASE_Y = 40;

function normalizeTool(raw: string | null | undefined): string {
  const t = (raw || "").toLowerCase().trim().replace("-", "_").replace(" ", "_");
  if (t === "re_categorization") return "recategorization";
  if (TOOL_ORDER.includes(t as (typeof TOOL_ORDER)[number])) return t;
  return "other";
}

function comparePerspectiveRows(a: IndexedPerspective, b: IndexedPerspective): number {
  const promisingDiff = Number(Boolean(b.p.promising)) - Number(Boolean(a.p.promising));
  if (promisingDiff !== 0) return promisingDiff;
  const selectedDiff = Number(Boolean(b.p.selected)) - Number(Boolean(a.p.selected));
  if (selectedDiff !== 0) return selectedDiff;
  const rankA = typeof a.p.rank_score === "number" ? a.p.rank_score : -1;
  const rankB = typeof b.p.rank_score === "number" ? b.p.rank_score : -1;
  if (rankB !== rankA) return rankB - rankA;
  return a.i - b.i;
}

function laneRowsToPositions(
  lanes: Array<{ laneKey: string; rows: IndexedPerspective[] }>,
): Record<string, { x: number; y: number }> {
  const out: Record<string, { x: number; y: number }> = {};
  lanes.forEach((lane, laneIndex) => {
    const sorted = [...lane.rows].sort(comparePerspectiveRows);
    sorted.forEach((row, rowIndex) => {
      out[row.p.perspective_id] = {
        x: LANE_BASE_X + laneIndex * LANE_X_STEP,
        y: ROW_BASE_Y + rowIndex * ROW_Y_STEP,
      };
    });
  });
  return out;
}

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

function sparkPromptLabel(
  field: (typeof SPARK_FIELDS)[number],
  mode: ExperienceMode,
): string {
  if (mode === "studio") return SPARK_LABELS[field];
  const quickLabels: Record<(typeof SPARK_FIELDS)[number], string> = {
    situation: "What's going on?",
    parts: "What matters most?",
    actions: "What can change?",
    role: "Who is involved?",
    key_goal: "What would a great outcome look like?",
  };
  return quickLabels[field];
}

function projectRefinementChips(projectType: ProjectType): string[] {
  const base = ["More like this", "Simpler", "More practical", "More original"];
  if (projectType === "home_decor") return [...base, "Renter-friendly", "Budget-friendly"];
  if (projectType === "event_celebration") return [...base, "More playful", "Kid-friendly"];
  if (projectType === "routine_lifestyle") return [...base, "Keep it realistic", "Easier to stick with"];
  if (projectType === "product_app") return [...base, "Push it further", "MVP first"];
  if (projectType === "business_service") return [...base, "Cheaper to launch", "Clearer offer"];
  if (projectType === "workflow_process") return [...base, "Faster handoff", "Less coordination"];
  return [...base, "Push it further", "Keep it realistic"];
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

function sectionIdForFlowStep(step: FlowStepKey): string {
  switch (step) {
    case "problem":
      return "problem-step";
    case "challenge":
      return "challenge-step";
    case "ideaBoard":
    case "generateIdeas":
    case "refinePicks":
    case "canvas":
      return "perspective-workspace";
    case "stakeholderCards":
      return "stakeholder-feature-cards-step";
    case "insights":
      return "insights-generate";
    case "shapeConcept":
      return "invention-builder";
    case "buildConcept":
      return "build-product-concept-action";
    default:
      return "perspective-workspace";
  }
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
  addOpen,
  addDraft,
  onAddClick,
  onAddDraftChange,
  onAddSubmit,
  onAddCancel,
  onDeleteLine,
}: {
  field: (typeof SPARK_FIELDS)[number];
  value: string;
  addOpen: boolean;
  addDraft: string;
  onAddClick: () => void;
  onAddDraftChange: (value: string) => void;
  onAddSubmit: () => void;
  onAddCancel: () => void;
  onDeleteLine: (index: number) => void;
}) {
  const lines = splitBaselineForDisplay(value, field);
  const empty =
    !lines.length || (lines.length === 1 && !(lines[0] ?? "").trim());
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
      <div className="flex flex-wrap gap-2 text-sm text-slate-800">
        {empty ? (
          <span className="text-xs text-slate-500">(empty)</span>
        ) : (
          lines.map((line, i) => (
            <span
              key={`${line}-${i}`}
              className="inline-flex items-center gap-1 rounded-full border border-slate-300 bg-white px-2.5 py-1"
            >
              <span>{line}</span>
              <button
                type="button"
                className="rounded-full border border-rose-300 bg-rose-50 px-1 text-[11px] font-bold leading-none text-rose-700 hover:bg-rose-100"
                onClick={() => onDeleteLine(i)}
                title="Delete item"
                aria-label="Delete item"
              >
                ×
              </button>
            </span>
          ))
        )}
        {!addOpen ? (
          <button
            type="button"
            className="rounded-full border border-indigo-300 bg-indigo-50 px-2 py-1 text-xs font-semibold text-indigo-700 hover:bg-indigo-100"
            onClick={onAddClick}
            title={BASELINE_ADD_LABELS[field]}
          >
            +
          </button>
        ) : null}
        {addOpen ? (
          <span className="inline-flex items-center gap-1 rounded-full border border-indigo-300 bg-indigo-50 px-2 py-1">
            <input
              type="text"
              value={addDraft}
              onChange={(e) => onAddDraftChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  onAddSubmit();
                } else if (e.key === "Escape") {
                  e.preventDefault();
                  onAddCancel();
                }
              }}
              className="w-36 border-none bg-transparent p-0 text-xs text-slate-800 outline-none"
              placeholder="Add item..."
              autoFocus
            />
            <button
              type="button"
              className="rounded-full bg-emerald-600 px-1.5 text-[11px] font-bold text-white hover:bg-emerald-700"
              onClick={onAddSubmit}
              title="Add"
            >
              +
            </button>
            <button
              type="button"
              className="rounded-full bg-slate-300 px-1.5 text-[11px] font-bold text-slate-700 hover:bg-slate-400"
              onClick={onAddCancel}
              title="Cancel"
            >
              ×
            </button>
          </span>
        ) : null}
      </div>
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
    "One line per role lens (e.g., creator, end user, operator, decision owner).",
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
  experienceMode = "studio",
  projectType = "product_app",
}: {
  initial: SessionDetail;
  sessionId: string;
  /** Keeps parent header (title) in sync when problem/title is saved inside the journey. */
  onSessionChange?: (s: SessionDetail) => void;
  experienceMode?: ExperienceMode;
  projectType?: ProjectType;
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
  const [perspectivePool, setPerspectivePool] = useState<Perspective[]>(
    () => initial.perspectives ?? [],
  );
  const [explorationActive, setExplorationActive] = useState(
    () => (initial.perspectives?.length ?? 0) === 0,
  );
  const [poolSearch, setPoolSearch] = useState("");
  const [poolSelectedOnly, setPoolSelectedOnly] = useState(false);
  const [lastPreviewRecommended, setLastPreviewRecommended] = useState<
    string | null
  >(null);
  const [ghostProposals, setGhostProposals] = useState<GhostProposal[]>([]);
  const [arrangeMode, setArrangeMode] = useState<ArrangeMode>("tool");
  const [lastArrangeLabel, setLastArrangeLabel] = useState<string | null>(null);
  const [layoutDirty, setLayoutDirty] = useState(false);
  const [leftRailCollapsed, setLeftRailCollapsed] = useState(false);
  const [baselineAddOpen, setBaselineAddOpen] = useState<
    Partial<Record<(typeof SPARK_FIELDS)[number], boolean>>
  >({});
  const [baselineAddDraft, setBaselineAddDraft] = useState<
    Partial<Record<(typeof SPARK_FIELDS)[number], string>>
  >({});
  const dirtyLayoutPositionsRef = useRef<Record<string, XY>>({});
  const isQuick = experienceMode === "quick";
  const isStudio = experienceMode === "studio";
  const sparkCardsOpenByDefault = !isQuick;
  const showQuickTray = isQuick;
  const sessionGoalLabel = deliverableLabel(projectType);

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
      const next = {
        situation: sp.situation,
        parts: normalizeStoredParts(sp.parts ?? ""),
        actions: sp.actions,
        role: isStudio ? sp.role : "Creator",
        key_goal: sp.key_goal,
      };
      setSparkEdit(next);
    }
  }, [session.spark_state, isStudio]);

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
    setArrangeMode("tool");
    setLastArrangeLabel(null);
    setLayoutDirty(false);
    setLeftRailCollapsed(false);
    dirtyLayoutPositionsRef.current = {};
    setPoolSearch("");
    setPoolSelectedOnly(false);
    setLastPreviewRecommended(null);
    setGhostProposals([]);
  }, [sessionId]);

  useEffect(() => {
    if (!explorationActive) {
      setPerspectivePool((prev) => {
        if (!layoutDirty) return session.perspectives;
        const prevPosById: Record<string, XY> = {};
        prev.forEach((p) => {
          const pos = p.position;
          if (pos) prevPosById[p.perspective_id] = pos;
        });
        return session.perspectives.map((p) => {
          const dirtyPos = dirtyLayoutPositionsRef.current[p.perspective_id];
          const fallbackPos = prevPosById[p.perspective_id];
          const keepPos = dirtyPos ?? fallbackPos;
          return keepPos ? { ...p, position: keepPos } : p;
        });
      });
    }
  }, [session.perspectives, explorationActive, session.session_id, layoutDirty]);

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

  async function patchBaselineField(
    field: (typeof SPARK_FIELDS)[number],
    nextValue: string,
  ) {
    if (!session.spark_state) return;
    setSparkEdit((prev) => ({ ...prev, [field]: nextValue }));
    await run("patch", () =>
      patchSpark(sessionId, {
        [field]: nextValue,
      }),
    );
  }

  async function addBaselineItemInline(field: (typeof SPARK_FIELDS)[number]) {
    const text = (baselineAddDraft[field] ?? "").trim();
    if (!text) return;
    const existing = splitBaselineForDisplay(sparkEdit[field] ?? "", field);
    const nextLines = [...existing, text];
    const nextValue =
      field === "parts" ? joinPartsLines(nextLines) : joinEditableLines(nextLines);
    await patchBaselineField(field, nextValue);
    setBaselineAddDraft((prev) => ({ ...prev, [field]: "" }));
    setBaselineAddOpen((prev) => ({ ...prev, [field]: false }));
  }

  async function deleteBaselineItem(
    field: (typeof SPARK_FIELDS)[number],
    index: number,
  ) {
    const existing = splitBaselineForDisplay(sparkEdit[field] ?? "", field);
    const nextLines = existing.filter((_, i) => i !== index);
    const nextValue =
      field === "parts" ? joinPartsLines(nextLines) : joinEditableLines(nextLines);
    await patchBaselineField(field, nextValue);
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
    setPerspectivePool((prev) =>
      prev.map((x) => (x.perspective_id === pid ? { ...x, ...patch } : x)),
    );
    if (explorationActive) {
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

  function onPerspectiveTextChange(perspectiveId: string, text: string) {
    patchSessionPerspective(perspectiveId, { text, description: text });
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
      setPerspectivePool((prev) =>
        prev.filter((x) => x.perspective_id !== p.perspective_id),
      );
      return;
    }
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
    const starterCard: Perspective = {
      perspective_id: newId(),
      text: "New perspective: click and refine this angle.",
      description: "New perspective: click and refine this angle.",
      title: "New Card",
      source_tool: "user",
      spark_element: "parts",
      selected: false,
      promising: false,
      pool_excluded: false,
    };
    setPoolSearch("");
    setPoolSelectedOnly(false);
    if (explorationActive) {
      setPerspectivePool((prev) => [
        ...prev,
        starterCard,
      ]);
      return;
    }
    setErr(null);
    setLoading("padd");
    try {
      const s = await addPerspective(sessionId, {
        text: starterCard.text,
        title: starterCard.title ?? null,
        source_tool: starterCard.source_tool,
        spark_element: starterCard.spark_element,
      });
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
      dirtyLayoutPositionsRef.current = {};
      setLayoutDirty(false);
      setExplorationActive(true);
      setLastPreviewRecommended(res.recommended_perspective ?? null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(null);
    }
  }

  function applyRefinementChip(chip: string) {
    const next = { ...poolSettings };
    const lower = chip.toLowerCase();
    if (lower.includes("simpler") || lower.includes("realistic")) {
      next.boldness = "low";
      next.novelty = "low";
    } else if (lower.includes("original") || lower.includes("push")) {
      next.boldness = "high";
      next.novelty = "high";
    }
    if (lower.includes("cheaper") || lower.includes("budget")) {
      next.goal_priority = "cost_efficiency";
    } else if (lower.includes("practical") || lower.includes("faster")) {
      next.goal_priority = "reliability";
    } else if (lower.includes("playful")) {
      next.goal_priority = "comfort";
    }
    setPoolSettings(next);
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
      dirtyLayoutPositionsRef.current = {};
      setLayoutDirty(false);
      setExplorationActive(false);
      setLastPreviewRecommended(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(null);
    }
  }

  async function runGenerateStakeholderFeatureCards() {
    if (!isStudio || explorationActive) return;
    setErr(null);
    setLoading("sfc-gen");
    try {
      const res = await generateStakeholderFeatureCards(sessionId, { max_cards: 24 });
      setSession(res.session);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(null);
    }
  }

  async function toggleStakeholderFeatureCard(featureId: string, selected: boolean) {
    if (!isStudio) return;
    const current = (session.stakeholder_feature_cards ?? []) as StakeholderFeatureCard[];
    const selectedIds = new Set(
      current.filter((c) => c.selected).map((c) => c.feature_id),
    );
    if (selected) selectedIds.add(featureId);
    else selectedIds.delete(featureId);
    setErr(null);
    setLoading("sfc-select");
    try {
      const res = await selectStakeholderFeatureCards(sessionId, [...selectedIds]);
      setSession(res.session);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(null);
    }
  }

  async function runAskSuggestions() {
    setErr(null);
    if (creativeAi === "mock") {
      setErr(
        "Ask AI Agent for Suggestions requires OpenAI provider. Set OPENAI_API_KEY and AI_PROVIDER=openai, restart backend, then try again.",
      );
      return;
    }
    setLoading("propose");
    try {
      const res = await proposeChanges(sessionId, { max_proposals: 6 });
      setGhostProposals(res.proposals ?? []);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Error";
      if (/requires OpenAI provider/i.test(msg)) {
        setErr(
          "Ask AI Agent for Suggestions requires OpenAI provider. Set OPENAI_API_KEY and AI_PROVIDER=openai, restart backend, then try again.",
        );
      } else {
        setErr(msg);
      }
    } finally {
      setLoading(null);
    }
  }

  async function onPerspectiveMove(
    perspectiveId: string,
    position: { x: number; y: number },
  ) {
    if (!explorationActive) {
      dirtyLayoutPositionsRef.current[perspectiveId] = position;
      setLayoutDirty(true);
    }
    patchSessionPerspective(perspectiveId, { position });
  }

  function onGhostMove(proposalId: string, position: { x: number; y: number }) {
    setGhostProposals((prev) =>
      prev.map((g) =>
        g.proposal_id === proposalId
          ? { ...g, card: { ...g.card, position } }
          : g,
      ),
    );
  }

  async function approveGhostProposal(proposalId: string) {
    const proposal = ghostProposals.find((g) => g.proposal_id === proposalId);
    if (!proposal) return;
    const pos = proposal.card.position ?? { x: 0, y: 0 };

    if (proposal.proposal_kind === "reposition" && proposal.target_perspective_id) {
      patchSessionPerspective(proposal.target_perspective_id, { position: pos, is_ghost: false });
      if (!explorationActive) {
        try {
          const s = await updatePerspective(sessionId, proposal.target_perspective_id, {
            position: pos,
            is_ghost: false,
          });
          setSession(s);
        } catch (e) {
          setErr(e instanceof Error ? e.message : "Error");
        }
      }
      setGhostProposals((prev) => prev.filter((g) => g.proposal_id !== proposalId));
      return;
    }

    const bridgeCard: Perspective = {
      ...proposal.card,
      perspective_id: newId(),
      is_ghost: false,
      approved_from_ghost: true,
      position: pos,
      selected: false,
      promising: false,
      pool_excluded: false,
    };
    if (explorationActive) {
      setPerspectivePool((prev) => [...prev, bridgeCard]);
      setGhostProposals((prev) => prev.filter((g) => g.proposal_id !== proposalId));
      return;
    }

    try {
      const s = await addPerspective(sessionId, {
        text: bridgeCard.text || bridgeCard.description || "",
        title: bridgeCard.title ?? null,
        source_tool: bridgeCard.source_tool ?? "association",
        spark_element: bridgeCard.spark_element ?? "parts",
        subtype: bridgeCard.subtype ?? null,
        why_interesting: bridgeCard.why_interesting ?? null,
        position: pos,
        is_ghost: false,
        approved_from_ghost: true,
      });
      setSession(s);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error");
      return;
    }
    setGhostProposals((prev) => prev.filter((g) => g.proposal_id !== proposalId));
  }

  function rejectGhostProposal(proposalId: string) {
    setGhostProposals((prev) => prev.filter((g) => g.proposal_id !== proposalId));
  }

  function buildToolArrangePositions(
    rows: IndexedPerspective[],
  ): Record<string, { x: number; y: number }> {
    const buckets: Record<string, IndexedPerspective[]> = {
      analogy: [],
      recategorization: [],
      combination: [],
      association: [],
      other: [],
    };
    rows.forEach((row) => {
      buckets[normalizeTool(row.p.source_tool)].push(row);
    });
    const lanes = [
      { laneKey: "analogy", rows: buckets.analogy },
      { laneKey: "recategorization", rows: buckets.recategorization },
      { laneKey: "combination", rows: buckets.combination },
      { laneKey: "association", rows: buckets.association },
      { laneKey: "other", rows: buckets.other },
    ].filter((lane) => lane.rows.length > 0);
    return laneRowsToPositions(lanes);
  }

  function buildThemeArrangePositions(
    rows: IndexedPerspective[],
  ): Record<string, { x: number; y: number }> {
    const insights = session.insights ?? [];
    const laneOrder: string[] = [];
    const perPerspectiveThemeCounts: Record<string, Record<string, number>> = {};

    insights.forEach((ins, idx) => {
      const fromLabel = (ins.theme_label ?? "").trim();
      const laneKey = fromLabel || `theme-${idx + 1}`;
      if (!laneOrder.includes(laneKey)) {
        laneOrder.push(laneKey);
      }
      const sourceIds = ins.source_perspective_ids ?? [];
      sourceIds.forEach((pid) => {
        const key = String(pid || "").trim();
        if (!key) return;
        if (!perPerspectiveThemeCounts[key]) {
          perPerspectiveThemeCounts[key] = {};
        }
        perPerspectiveThemeCounts[key][laneKey] =
          (perPerspectiveThemeCounts[key][laneKey] ?? 0) + 1;
      });
    });

    const sparkLaneOrder = ["situation", "parts", "actions", "role", "key_goal"] as const;
    const buckets: Record<string, IndexedPerspective[]> = {};
    rows.forEach((row) => {
      const counts = perPerspectiveThemeCounts[row.p.perspective_id] ?? {};
      let bestLane = "unmapped";
      let bestCount = -1;
      laneOrder.forEach((laneKey) => {
        const score = counts[laneKey] ?? 0;
        if (score > bestCount) {
          bestCount = score;
          bestLane = laneKey;
        }
      });
      if (bestCount <= 0) {
        const sparkKey = String(row.p.spark_element || "")
          .toLowerCase()
          .trim()
          .replace("-", "_")
          .replace(" ", "_");
        if ((sparkLaneOrder as readonly string[]).includes(sparkKey)) {
          bestLane = `spark:${sparkKey}`;
        } else {
          bestLane = "unmapped";
        }
      }
      if (!buckets[bestLane]) {
        buckets[bestLane] = [];
      }
      buckets[bestLane].push(row);
    });

    const lanes: Array<{ laneKey: string; rows: IndexedPerspective[] }> = [];
    laneOrder.forEach((laneKey) => {
      if (buckets[laneKey]?.length) {
        lanes.push({ laneKey, rows: buckets[laneKey] });
      }
    });
    sparkLaneOrder.forEach((sparkKey) => {
      const laneKey = `spark:${sparkKey}`;
      if (buckets[laneKey]?.length) {
        lanes.push({ laneKey, rows: buckets[laneKey] });
      }
    });
    if (buckets.unmapped?.length) {
      lanes.push({ laneKey: "unmapped", rows: buckets.unmapped });
    }
    return laneRowsToPositions(lanes);
  }

  async function autoArrangePerspectives(mode: ArrangeMode) {
    const source = perspectivePool;
    if (!source.length) return;
    setErr(null);

    const indexed = source.map((p, i) => ({ p, i }));
    const positionById =
      mode === "theme"
        ? buildThemeArrangePositions(indexed)
        : buildToolArrangePositions(indexed);
    const nextPool = source.map((p) => ({
      ...p,
      position: positionById[p.perspective_id] ?? p.position ?? { x: 0, y: 0 },
    }));

    setPerspectivePool(nextPool);
    if (!explorationActive) {
      setSession((prev) => ({
        ...prev,
        perspectives: prev.perspectives.map((p) => ({
          ...p,
          position: positionById[p.perspective_id] ?? p.position ?? { x: 0, y: 0 },
        })),
      }));
      nextPool.forEach((p) => {
        dirtyLayoutPositionsRef.current[p.perspective_id] = p.position ?? { x: 0, y: 0 };
      });
      setLayoutDirty(true);
    }

    setLastArrangeLabel(mode === "theme" ? "By Theme" : "By Tool");
  }

  function handleArrangeModeChange(mode: ArrangeMode) {
    setArrangeMode(mode);
    void autoArrangePerspectives(mode);
  }

  async function saveLayoutChanges() {
    if (explorationActive || !layoutDirty) return;
    const dirtyEntries = Object.entries(dirtyLayoutPositionsRef.current);
    if (!dirtyEntries.length) {
      setLayoutDirty(false);
      return;
    }
    setErr(null);
    setLoading("layout-save");
    try {
      let latest: SessionDetail | null = null;
      for (const [pid, pos] of dirtyEntries) {
        latest = await updatePerspective(sessionId, pid, { position: pos });
      }
      if (latest) {
        setSession(latest);
        setPerspectivePool(latest.perspectives);
      }
      dirtyLayoutPositionsRef.current = {};
      setLayoutDirty(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(null);
    }
  }

  function discardLayoutChanges() {
    if (explorationActive || !layoutDirty) return;
    setPerspectivePool(session.perspectives);
    dirtyLayoutPositionsRef.current = {};
    setLayoutDirty(false);
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
    rows.sort((a, b) => a.i - b.i);
    return rows.map(({ p }) => p);
  }, [perspectivePool, poolSearch, poolSelectedOnly]);

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

  const stakeholderFeatureCards = (session.stakeholder_feature_cards ??
    []) as StakeholderFeatureCard[];
  const selectedStakeholderFeatureCards = stakeholderFeatureCards.filter((c) => c.selected);
  const groupedStakeholderFeatureCards = useMemo(() => {
    const grouped: Record<string, StakeholderFeatureCard[]> = {};
    stakeholderFeatureCards.forEach((card) => {
      const key = (card.stakeholder || "Creator").trim() || "Creator";
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(card);
    });
    return grouped;
  }, [stakeholderFeatureCards]);

  /** Build runs from selected/top perspectives + stakeholder feature cards (insights optional signal). */
  const inventionLocked =
    loading !== null ||
    explorationActive ||
    session.perspectives.length === 0;

  const inventionLockTitle =
    loading !== null
      ? "Wait for the current action to finish."
      : explorationActive
        ? "Save your Idea Board pool first."
        : session.perspectives.length === 0
          ? "Generate and save perspectives first."
        : undefined;

  const selectedForRail = explorationActive
    ? []
    : perspectivesInPool.filter((p) => p.selected);
  const baselineFields: Array<(typeof SPARK_FIELDS)[number]> =
    isQuick
      ? SPARK_FIELDS.filter((f) => f !== "role")
      : [...SPARK_FIELDS];
  const refinementChips = projectRefinementChips(projectType);
  const scrollToFlowStep = (step: FlowStepKey) => {
    const targetId = sectionIdForFlowStep(step);
    const el = document.getElementById(targetId);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const quickTray = showQuickTray ? (
    <aside className="rounded-2xl border border-slate-200 bg-white p-4 shadow-card">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
        Quick guide
      </p>
      <h3 className="mt-1 text-sm font-semibold text-slate-900">
        {projectTypeLabel(projectType)}
      </h3>
      <p className="mt-2 text-xs leading-relaxed text-slate-600">
        {suggestedNextMove(session)}
      </p>
      <p className="mt-3 text-xs text-slate-500">
        Target output: <strong>{sessionGoalLabel}</strong>
      </p>
    </aside>
  ) : null;

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

      <section id="problem-step" className="card stack">
        <h2 style={{ margin: 0, fontSize: "1.1rem" }}>
          {isStudio ? "1. Problem" : "Session and problem"}
        </h2>
        <p className="muted text-sm" style={{ marginTop: "0.25rem" }}>
          <strong>{stepLabel(session.current_step)}</strong> · iteration{" "}
          {session.current_iteration} · {session.status}
        </p>
        <p className="muted" style={{ marginTop: "0.35rem" }}>
          Describe what you want to create or improve. You can revise it anytime;
          later steps use your latest version.
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
          {loading === "prob" ? "…" : "Save challenge"}
        </button>
        {isStudio ? (
          <p className="text-xs font-medium text-indigo-700">
            Next: 2. Understand challenge
          </p>
        ) : null}
      </section>

      <details id="challenge-step" className="card stack" open={sparkCardsOpenByDefault}>
        <summary
          className="cursor-pointer list-none font-semibold [&::-webkit-details-marker]:hidden"
          style={{ fontSize: "1.1rem" }}
        >
          {isStudio ? "2. Understand challenge" : "1. Understand the challenge"}
        </summary>
        <div className="mt-3 stack">
        {!session.spark_state ? (
          <p className="muted">
            We will frame your challenge in five lenses behind the scenes. Generation
            runs on the server (
            {creativeAi === "openai"
              ? "OpenAI"
              : creativeAi === "mock"
                ? "offline templates — add OPENAI_API_KEY for real LLM output"
                : "checking…"}
            ). After generation, this section shows your baseline read-only; you can
            generate stakeholder feature cards after completing the Idea board.
          </p>
        ) : (
          <p className="muted">
            Generated baseline (read-only). Edit individual lines here as needed
            before generating stakeholder feature cards.
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
          {loading === "spark" ? "…" : "Generate challenge frame"}
        </button>

        {session.spark_state ? (
          <div className="stack">
            {baselineFields.map((f) => (
              <div key={f} data-spark-anchor={f} data-spark-phase="baseline">
                <div className="label">{sparkPromptLabel(f, experienceMode)}</div>
                <SparkBaselineReadOnly
                  field={f}
                  value={sparkEdit[f] ?? ""}
                  addOpen={Boolean(baselineAddOpen[f])}
                  addDraft={baselineAddDraft[f] ?? ""}
                  onAddClick={() =>
                    setBaselineAddOpen((prev) => ({ ...prev, [f]: true }))
                  }
                  onAddDraftChange={(value) =>
                    setBaselineAddDraft((prev) => ({ ...prev, [f]: value }))
                  }
                  onAddSubmit={() => void addBaselineItemInline(f)}
                  onAddCancel={() => {
                    setBaselineAddOpen((prev) => ({ ...prev, [f]: false }));
                    setBaselineAddDraft((prev) => ({ ...prev, [f]: "" }));
                  }}
                  onDeleteLine={(idx) => void deleteBaselineItem(f, idx)}
                />
              </div>
            ))}
            {isQuick ? (
              <p className="mt-1 text-xs text-indigo-700">
                Stakeholder feature cards appear after Idea board so you can shape ideas first.
              </p>
            ) : null}
          </div>
        ) : null}
        {isStudio ? (
          <p className="text-xs font-medium text-indigo-700">
            Next: 3. Idea Board
          </p>
        ) : null}
        </div>
      </details>

      <section
        id="perspective-workspace"
        className="card stack min-h-[min(68vh,900px)] rounded-2xl border-2 border-indigo-100 bg-gradient-to-b from-white to-slate-50/80 p-3 shadow-card sm:p-4"
      >
        <div className="mb-2 flex flex-wrap items-end justify-between gap-2 border-b border-slate-100 pb-3">
          <div>
            <h2 style={{ margin: 0, fontSize: "1.25rem" }} className="text-slate-900">
              {isStudio ? "3. Idea Board" : "Idea board"}
            </h2>
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
          refinementActions={
            <div className="flex flex-wrap gap-2">
              {refinementChips.slice(0, 8).map((chip) => (
                <button
                  key={chip}
                  type="button"
                  className="rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-[11px] font-semibold text-indigo-700 hover:bg-indigo-100 disabled:opacity-50"
                  disabled={loading !== null || perspectivesAiLocked}
                  onClick={() => applyRefinementChip(chip)}
                >
                  {chip}
                </button>
              ))}
            </div>
          }
        />

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-md hover:bg-indigo-700 disabled:opacity-50"
            disabled={loading !== null || perspectivesAiLocked}
            title={
              perspectivesAiLocked
                ? "Generate challenge frame first."
                : "One AI call — up to 30 directions in your browser only."
            }
            onClick={() => void runGeneratePerspectives()}
          >
            {loading === "persp-gen" ? "…" : (isStudio ? "4. Generate Ideas" : "Generate ideas")}
          </button>
          <button
            type="button"
            className="btn-secondary rounded-xl px-3 py-2 text-sm"
            disabled={loading !== null || perspectivesManualLocked}
            onClick={() => void addBlankPerspective()}
          >
            {loading === "padd" ? "…" : "Add your own idea"}
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
            <strong className="text-indigo-900">Suggested angle: </strong>
            <span className="whitespace-pre-wrap">{lastPreviewRecommended}</span>
          </div>
        ) : null}

        {session.last_recommended_perspective && !explorationActive ? (
          <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
            <strong className="text-slate-800">Last saved suggestion: </strong>
            {session.last_recommended_perspective}
          </div>
        ) : null}

        <div className="mt-3 flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-2.5 sm:flex-row sm:flex-wrap sm:items-end">
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
          className="rank-help mt-3 rounded-xl border border-slate-200 bg-slate-50/90 px-3 py-2 text-xs leading-relaxed text-slate-700"
          role="note"
        >
          <p className="m-0">
            <strong className="text-slate-900">About Promising score</strong> — After you generate
            ideas, each card can show a relative strength score as stars (★). It
            only compares ideas <em>in that batch</em>: how well the text lines up with
            your challenge and frame, how well it fits the boldness / novelty / goal you
            picked, plus a little boost for variety.{" "}
            <span className="text-slate-600">
              Hover stars to see the exact percentage. Use it to spot stronger
              directions first; it is not a test score.
            </span>
          </p>
        </div>

        <div className="mt-3 min-h-0 flex-1">
          {isStudio ? (
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              5. Studio Canvas
            </p>
          ) : null}
          <PerspectiveCanvas
            perspectives={displayedPerspectives}
            proposals={ghostProposals}
            loading={loading !== null}
            poolSearch={poolSearch}
            onPoolSearchChange={setPoolSearch}
            requiresOpenAI={creativeAi !== "openai"}
            showLayoutActions={!explorationActive}
            layoutDirty={layoutDirty}
            onSaveLayout={() => void saveLayoutChanges()}
            onDiscardLayout={discardLayoutChanges}
            arrangeMode={arrangeMode}
            lastArrangeLabel={lastArrangeLabel}
            onArrangeModeChange={handleArrangeModeChange}
            onAskSuggestions={() => void runAskSuggestions()}
            onPerspectiveMove={(id, position) => void onPerspectiveMove(id, position)}
            onPerspectiveTextChange={onPerspectiveTextChange}
            onPerspectiveTextSave={(id) => void savePerspectiveText(id)}
            onDeletePerspective={(id) => {
              const p = perspectivePool.find((x) => x.perspective_id === id);
              if (!p) return;
              void removePerspectiveCard(p);
            }}
            onGhostMove={onGhostMove}
            onToggleSelected={(id, selected) => {
              const p = perspectivePool.find((x) => x.perspective_id === id);
              if (!p) return;
              void togglePerspectiveField(p, "selected", selected);
            }}
            onApproveProposal={(proposalId) => void approveGhostProposal(proposalId)}
            onRejectProposal={rejectGhostProposal}
          />
        </div>

        <div className="sticky bottom-0 z-10 mt-4 border-t border-slate-200 bg-gradient-to-t from-slate-50 to-transparent pt-3">
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
            Saves every card in your draft with its flags (× not in board, ★ promising,
            checkbox for insights). Re-open the session to see the same layout.
            If none are checked, the top 10 by score are used.
          </p>
          {isStudio ? (
            <p className="mt-1 text-xs font-medium text-indigo-700">
              Next: 6. Stakeholder Feature Cards
            </p>
          ) : null}
        </div>
      </section>

      {isStudio ? (
        <section
          id="stakeholder-feature-cards-step"
          className="card stack rounded-2xl border border-slate-200 bg-white p-4 shadow-card"
        >
          <h2 className="text-lg font-semibold text-slate-900">
            6. Stakeholder Feature Cards
          </h2>
          <p className="muted text-sm text-slate-600">
            Generate consolidated functional and technical feature cards from saved
            perspectives, grouped by stakeholder.
          </p>
          <div className="row" style={{ gap: "0.45rem", flexWrap: "wrap" }}>
            <button
              type="button"
              className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
              disabled={loading !== null || explorationActive || session.perspectives.length === 0}
              title={
                explorationActive
                  ? "Save your Idea board pool first."
                  : session.perspectives.length === 0
                    ? "Generate and save perspectives first."
                    : "Generate stakeholder feature cards from saved perspectives."
              }
              onClick={() => void runGenerateStakeholderFeatureCards()}
            >
              {loading === "sfc-gen"
                ? "Generating…"
                : stakeholderFeatureCards.length > 0
                  ? "Regenerate stakeholder feature cards"
                  : "Generate stakeholder feature cards"}
            </button>
            {selectedStakeholderFeatureCards.length > 0 ? (
              <span className="text-xs text-slate-500">
                {selectedStakeholderFeatureCards.length} selected for build context
              </span>
            ) : null}
          </div>

          {stakeholderFeatureCards.length === 0 ? (
            <p className="text-xs text-slate-500">
              No feature cards yet. Save your perspective pool, then generate cards.
            </p>
          ) : (
            <div className="space-y-3">
              {Object.entries(groupedStakeholderFeatureCards).map(([stakeholder, cards]) => (
                <div key={stakeholder} className="rounded-xl border border-slate-200 bg-slate-50/70 p-2.5">
                  <h3 className="text-sm font-semibold text-slate-900">{stakeholder}</h3>
                  <div className="mt-1.5 space-y-1.5">
                    {cards.map((card) => (
                      <label
                        key={card.feature_id}
                        className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 bg-white p-2.5 hover:bg-slate-50"
                      >
                        <input
                          type="checkbox"
                          className="mt-0.5"
                          checked={card.selected}
                          onChange={(e) =>
                            void toggleStakeholderFeatureCard(card.feature_id, e.target.checked)
                          }
                          disabled={loading !== null}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="m-0 text-sm font-semibold text-slate-900">{card.title}</p>
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700">
                              {card.feature_type}
                            </span>
                            {card.priority ? (
                              <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-medium text-indigo-700">
                                {card.priority}
                              </span>
                            ) : null}
                          </div>
                          <p className="mt-1 text-xs text-slate-700">{card.description}</p>
                          {card.why_it_matters ? (
                            <p className="mt-1 text-[11px] text-slate-500">
                              Why it matters: {card.why_it_matters}
                            </p>
                          ) : null}
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
          <p className="text-xs font-medium text-indigo-700">Next: 7. Insights</p>
        </section>
      ) : null}

      <section
        id="insights-generate"
        className="card stack rounded-2xl border border-slate-200 bg-white p-4 shadow-card"
      >
        <h2 className="text-lg font-semibold text-slate-900">
          {isStudio ? "7. Insights" : "Insights"}
        </h2>
        <p className="muted text-sm text-slate-600">
          Synthesize from checked ideas. If none are checked, the server uses the{" "}
          <strong>top 10</strong> cards by score. Run this before shaping your{" "}
          {sessionGoalLabel.toLowerCase()}.
        </p>
        <button
          type="button"
          className="mt-2 w-full max-w-xs rounded-xl bg-spark-situation py-2.5 text-sm font-semibold text-white shadow-soft disabled:opacity-45 sm:w-auto sm:px-6"
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
        {isStudio ? (
          <p className="text-xs font-medium text-indigo-700">
            Next: 8. Shape Product Concept
          </p>
        ) : null}
      </section>

      <InventionBuilder
        session={session}
        loading={loading}
        inventionLocked={inventionLocked}
        inventionLockTitle={inventionLockTitle}
        deliverableLabel={isStudio ? "Product Concept" : sessionGoalLabel}
        sectionTitle={isStudio ? "8. Shape Product Concept" : undefined}
        buildButtonLabel={isStudio ? "9. Build Product Concept" : undefined}
        buildButtonId={isStudio ? "build-product-concept-action" : undefined}
        selectedFeatureCardsCount={selectedStakeholderFeatureCards.length}
        onGenerate={() => run("inv", () => generateInvention(sessionId))}
      />

      <EnlightenmentView
        session={session}
        loading={loading}
        deliverableLabel={sessionGoalLabel}
        onGenerate={() => run("enl", () => generateEnlightenment(sessionId))}
      />
    </div>
  );

  return (
    <div className="journey-page mx-auto w-full max-w-[1600px] px-2 pb-8 sm:px-4">
      <SPARKWorkspace
        railCollapsed={leftRailCollapsed}
        rail={
          <SPARKRail
            flowMode={experienceMode}
            progressPercent={workflowProgressPercent(session.current_step)}
            selectedPerspectives={selectedForRail}
            insights={session.insights ?? []}
            invention={session.invention}
            flowStatus={{
              hasSpark: Boolean(session.spark_state),
              hasPerspectives: session.perspectives.length > 0 && !explorationActive,
              hasStakeholderFeatureCards: stakeholderFeatureCards.length > 0,
              hasInsights: (session.insights?.length ?? 0) > 0,
              hasBuildInputs:
                (session.insights?.length ?? 0) > 0 ||
                selectedStakeholderFeatureCards.length > 0,
              hasInvention: Boolean(session.invention),
            }}
            perspectiveDraftActive={explorationActive}
            collapsed={leftRailCollapsed}
            onToggleCollapsed={() => setLeftRailCollapsed((v) => !v)}
            onFlowStepSelect={scrollToFlowStep}
          />
        }
        center={mainColumn}
        tray={quickTray}
        footer={null}
      />
    </div>
  );
}
