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
  title?: string | null;
  why_interesting?: string | null;
  boldness_level?: string | null;
  novelty_level?: string | null;
  goal_priority_alignment?: string | null;
  iteration?: number;
  source_tool: string;
  /** Cognitive subtype within source_tool (unified pool generation). */
  subtype?: string | null;
  /** Deterministic post-LLM ranking score (0–1 scale). */
  rank_score?: number | null;
  spark_element: string;
  part_ref?: string | null;
  action_ref?: string | null;
  selected: boolean;
  promising?: boolean;
  /** Marked “not in pool” — muted on card; toggled off to include again; persisted. */
  pool_excluded?: boolean;
  position?: { x: number; y: number };
  is_ghost?: boolean;
  approved_from_ghost?: boolean;
}

export interface GhostProposal {
  proposal_id: string;
  proposal_kind: "reposition" | "bridge_card";
  target_perspective_id?: string | null;
  related_perspective_ids: string[];
  rationale?: string | null;
  card: Perspective;
}

export interface ProposeChangesResponse {
  session: SessionDetail;
  proposals: GhostProposal[];
}

/** Unified perspective pool controls (single GenAI call, all four cognitive tools). */
export type BoldnessTier = "low" | "medium" | "high";
export type NoveltyTier = "low" | "medium" | "high";
export type GoalPriorityPool =
  | "simplicity"
  | "cost_efficiency"
  | "comfort"
  | "innovation"
  | "sustainability"
  | "speed"
  | "reliability";

export interface PerspectivePoolSettings {
  boldness: BoldnessTier;
  novelty: NoveltyTier;
  goal_priority: GoalPriorityPool;
}

export const BOLDNESS_TIER_OPTIONS: BoldnessTier[] = ["low", "medium", "high"];
export const NOVELTY_TIER_OPTIONS: NoveltyTier[] = ["low", "medium", "high"];

export const GOAL_PRIORITY_POOL_OPTIONS: { value: GoalPriorityPool; label: string }[] = [
  { value: "simplicity", label: "Simplicity" },
  { value: "cost_efficiency", label: "Cost efficiency" },
  { value: "comfort", label: "Comfort" },
  { value: "innovation", label: "Innovation" },
  { value: "sustainability", label: "Sustainability" },
  { value: "speed", label: "Speed" },
  { value: "reliability", label: "Reliability" },
];

export const DEFAULT_PERSPECTIVE_POOL: PerspectivePoolSettings = {
  boldness: "medium",
  novelty: "medium",
  goal_priority: "innovation",
};

export interface InsightRecord {
  insight_id: string;
  iteration: number;
  text: string;
  /** Optional: why this insight matters for invention work */
  why_it_matters?: string | null;
  source_perspective_ids?: string[];
  source_tools?: string[];
  source_spark_elements?: string[];
  theme_label?: string | null;
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

export type SparkTargetLever =
  | "Situation"
  | "Pieces"
  | "Actions"
  | "Role"
  | "Key Goal"
  | "Surprise Me";

export type CognitiveToolLever =
  | "Analogy"
  | "Re-categorization"
  | "Combination"
  | "Association"
  | "Auto-select best";

export type DepthLever = "Conservative" | "Moderate" | "Radical";

export type DivergenceLever = "Focused" | "Balanced" | "Exploratory";

export type AbstractionLever = "Zoom-In" | "Normal" | "Zoom-Out";

export type DomainLensLever =
  | "Nature"
  | "Engineering"
  | "Education"
  | "Healthcare"
  | "Random";

export type GoalPriorityLever =
  | "Speed"
  | "Simplicity"
  | "Cost"
  | "Comfort"
  | "Innovation"
  | "Sustainability";

export type NoveltyLever = "Practical" | "Balanced" | "Unexpected";

/** API field name `tool` matches backend serialization alias. */
export interface CreativeLevers {
  spark_target: SparkTargetLever;
  tool: CognitiveToolLever;
  depth: DepthLever;
  divergence: DivergenceLever;
  abstraction: AbstractionLever;
  domain_lens: DomainLensLever;
  goal_priority: GoalPriorityLever;
  novelty: NoveltyLever;
}

export const SPARK_TARGET_OPTIONS: SparkTargetLever[] = [
  "Situation",
  "Pieces",
  "Actions",
  "Role",
  "Key Goal",
  "Surprise Me",
];

export const COGNITIVE_TOOL_OPTIONS: CognitiveToolLever[] = [
  "Analogy",
  "Re-categorization",
  "Combination",
  "Association",
  "Auto-select best",
];

export const DEPTH_OPTIONS: DepthLever[] = [
  "Conservative",
  "Moderate",
  "Radical",
];

export const DIVERGENCE_OPTIONS: DivergenceLever[] = [
  "Focused",
  "Balanced",
  "Exploratory",
];

export const ABSTRACTION_OPTIONS: AbstractionLever[] = [
  "Zoom-In",
  "Normal",
  "Zoom-Out",
];

export const DOMAIN_LENS_OPTIONS: DomainLensLever[] = [
  "Nature",
  "Engineering",
  "Education",
  "Healthcare",
  "Random",
];

export const GOAL_PRIORITY_OPTIONS: GoalPriorityLever[] = [
  "Speed",
  "Simplicity",
  "Cost",
  "Comfort",
  "Innovation",
  "Sustainability",
];

export const NOVELTY_OPTIONS: NoveltyLever[] = [
  "Practical",
  "Balanced",
  "Unexpected",
];

/** Defaults include hidden API fields (divergence, abstraction, domain_lens) for prompts. */
export const DEFAULT_CREATIVE_LEVERS: CreativeLevers = {
  spark_target: "Pieces",
  tool: "Analogy",
  depth: "Moderate",
  divergence: "Exploratory",
  abstraction: "Normal",
  domain_lens: "Engineering",
  goal_priority: "Innovation",
  novelty: "Balanced",
};

export interface PerspectivesGenerateResponse {
  session: SessionDetail;
  perspectives: Perspective[];
  recommended_perspective?: string | null;
  insight_candidates: string[];
  creative_levers_applied?: CreativeLevers | null;
  perspective_pool_applied?: PerspectivePoolSettings | null;
}

export interface SessionDetail extends SessionSummary {
  current_iteration: number;
  spark_state: SparkState | null;
  variations: Record<string, VariationItem[]>;
  tool_applications: Record<string, unknown>[];
  /** Persisted when using creative lever generation. */
  last_creative_levers?: CreativeLevers | null;
  last_perspective_pool?: PerspectivePoolSettings | null;
  last_recommended_perspective?: string | null;
  last_insight_candidates?: string[];
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
