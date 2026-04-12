export type SessionStatus = "active" | "archived";

export type WorkflowStep =
  | "session_created"
  | "spark_generated"
  | "variations_generated"
  | "perspectives_generated"
  | "insights_generated"
  | "invention_generated"
  | "enlightenment_generated";

export type CreativityTool =
  | "analogy"
  | "recategorization"
  | "combination"
  | "association";

export interface SparkState {
  situation: string;
  parts: string;
  actions: string;
  role: string;
  key_goal: string;
}

export interface VariationItem {
  variation_id: string;
  element: string;
  text: string;
  source: "generated" | "user";
}

export interface Perspective {
  perspective_id: string;
  text: string;
  description?: string;
  iteration?: number;
  source_tool: string;
  spark_element: string;
  part_ref?: string | null;
  action_ref?: string | null;
  selected: boolean;
  promising?: boolean;
}

export interface InsightRecord {
  insight_id: string;
  iteration: number;
  text: string;
}

export interface InventionArtifact {
  title: string;
  description: string;
  benefits: string;
  next_steps: string;
}

export interface EnlightenmentArtifact {
  summary: string;
  principles: string[];
  applies_elsewhere: string;
}

export type HistoryEventKind = string;

export interface HistoryEntry {
  entry_id: string;
  kind: HistoryEventKind;
  payload: Record<string, unknown>;
  created_at: string;
}

export interface SessionSummary {
  session_id: string;
  title: string | null;
  problem_statement: string;
  status: SessionStatus;
  current_step: WorkflowStep;
  updated_at: string;
}

export interface SessionListResponse {
  items: SessionSummary[];
  total: number;
}

export interface SessionDetail extends SessionSummary {
  current_iteration: number;
  spark_state: SparkState | null;
  variations: Record<string, VariationItem[]>;
  tool_applications: Record<string, unknown>[];
  perspectives: Perspective[];
  insights: InsightRecord[];
  invention: InventionArtifact | null;
  inventions: InventionArtifact[];
  enlightenment: EnlightenmentArtifact | null;
  history: HistoryEntry[];
  created_at: string;
  owner_id: string | null;
  deleted?: boolean | null;
  deleted_at?: string | null;
}
