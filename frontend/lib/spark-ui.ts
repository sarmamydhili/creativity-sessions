import type { SessionDetail, WorkflowStep } from "@/lib/types";

const ORDER: WorkflowStep[] = [
  "session_created",
  "spark_generated",
  "variations_generated",
  "perspectives_generated",
  "insights_generated",
  "invention_generated",
  "enlightenment_generated",
];

export function workflowProgressPercent(step: WorkflowStep): number {
  const i = ORDER.indexOf(step);
  if (i < 0) return 0;
  return Math.round((i / (ORDER.length - 1)) * 100);
}

/** True when `step` is the same as or after `minimum` in the creativity journey order. */
export function stepAtOrAfter(step: WorkflowStep, minimum: WorkflowStep): boolean {
  const i = ORDER.indexOf(step);
  const j = ORDER.indexOf(minimum);
  if (i < 0 || j < 0) return false;
  return i >= j;
}

export function suggestedNextMove(session: SessionDetail): string {
  const s = session.current_step;
  if (s === "session_created") {
    return "Save your challenge, then generate a quick challenge frame to start exploring.";
  }
  if (s === "spark_generated") {
    return "Refine your frame if needed, then open the Idea board and generate directions.";
  }
  if (s === "variations_generated") {
    return "Generate one idea batch, shortlist favorites, and save your board.";
  }
  if (s === "perspectives_generated") {
    return "Find patterns from your selected ideas, then shape your concept.";
  }
  if (s === "insights_generated") {
    return "Build your concept plan, then save reusable lessons.";
  }
  if (s === "invention_generated") {
    return "Capture reusable lessons from this session.";
  }
  return "Start a new angle or explore another SPARK dimension.";
}

export type SparkRailKey =
  | "situation"
  | "parts"
  | "actions"
  | "role"
  | "key_goal";

export type RailStatus = "unexplored" | "active" | "explored";

export function sparkRailStatus(
  session: SessionDetail | null,
  activeKey: SparkRailKey,
  key: SparkRailKey,
): RailStatus {
  if (activeKey === key) return "active";
  if (!session?.spark_state) return "unexplored";
  const sp = session.spark_state;
  const field = sp[key] ?? "";
  const hasBaseline = field.trim().length > 0;
  const vars = session.variations?.[key] ?? [];
  const hasVars = Array.isArray(vars) && vars.length > 0;
  if (hasBaseline || hasVars) return "explored";
  return "unexplored";
}
