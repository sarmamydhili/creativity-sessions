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

export function suggestedNextMove(session: SessionDetail): string {
  const s = session.current_step;
  if (s === "session_created") {
    return "Save your problem statement, then tap Generate SPARK to frame the challenge in five dimensions.";
  }
  if (s === "spark_generated") {
    return "Try variations on one SPARK dimension, then open Perspectives to blend ideas with creative levers.";
  }
  if (s === "variations_generated") {
    return "Generate perspectives (creative levers or classic matrix), then select cards for insights.";
  }
  if (s === "perspectives_generated") {
    return "Generate insights from your selected perspectives, then build a solution sketch.";
  }
  if (s === "insights_generated") {
    return "Build your invention concept, then extract learning for your library.";
  }
  if (s === "invention_generated") {
    return "Extract enlightenment to capture reusable principles from this session.";
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
