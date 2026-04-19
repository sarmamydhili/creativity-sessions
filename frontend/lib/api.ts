import type {
  BoldnessTier,
  CreativeLevers,
  GoalPriorityPool,
  NoveltyTier,
  Perspective,
  PerspectivePoolSettings,
  PerspectivesGenerateResponse,
  SessionDetail,
  SessionListResponse,
  VariationItem,
  InsightRecord,
  ProposeChangesResponse,
} from "./types";

function baseUrl(): string {
  return process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
}

async function parseError(r: Response): Promise<string> {
  try {
    const body = (await r.json()) as { detail?: string | { msg?: string }[] };
    if (typeof body.detail === "string") return body.detail;
    if (Array.isArray(body.detail)) return JSON.stringify(body.detail);
  } catch {
    /* ignore */
  }
  return r.statusText || "Request failed";
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`${baseUrl()}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });
  if (!r.ok) throw new Error(await parseError(r));
  if (r.status === 204) return undefined as T;
  return r.json() as Promise<T>;
}

export async function getHealth(): Promise<{
  status: string;
  creative_ai?: "openai" | "mock";
}> {
  return api("/health");
}

export async function listSessions(params?: {
  owner_id?: string | null;
  limit?: number;
  skip?: number;
}): Promise<SessionListResponse> {
  const q = new URLSearchParams();
  if (params?.owner_id != null && params.owner_id !== "")
    q.set("owner_id", params.owner_id);
  if (params?.limit != null) q.set("limit", String(params.limit));
  if (params?.skip != null) q.set("skip", String(params.skip));
  const qs = q.toString();
  return api(`/api/sessions${qs ? `?${qs}` : ""}`);
}

export async function createSession(body: {
  problem_statement: string;
  title?: string | null;
  owner_id?: string | null;
  user_id?: string | null;
}): Promise<SessionDetail> {
  return api("/api/sessions", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function getSession(sessionId: string): Promise<SessionDetail> {
  return api(`/api/sessions/${encodeURIComponent(sessionId)}`);
}

export async function patchSession(
  sessionId: string,
  body: {
    problem_statement?: string;
    title?: string | null;
  },
): Promise<SessionDetail> {
  return api(`/api/sessions/${encodeURIComponent(sessionId)}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export async function resumeSession(sessionId: string): Promise<SessionDetail> {
  return api(`/api/sessions/${encodeURIComponent(sessionId)}/resume`, {
    method: "POST",
  });
}

export async function deleteSession(sessionId: string): Promise<void> {
  await api<void>(
    `/api/sessions/${encodeURIComponent(sessionId)}`,
    { method: "DELETE" },
  );
}

export async function generateSpark(
  sessionId: string,
  body: { extra_context?: string | null } = {},
): Promise<{ session: SessionDetail; spark: import("./types").SparkState }> {
  return api(`/api/sessions/${encodeURIComponent(sessionId)}/spark`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function patchSpark(
  sessionId: string,
  body: Partial<import("./types").SparkState>,
): Promise<SessionDetail> {
  return api(`/api/sessions/${encodeURIComponent(sessionId)}/spark`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

/** Appends AI lines to merged_variations; does not persist until persistVariations. */
export async function generateVariations(
  sessionId: string,
  elements: string[],
  existingItems: Record<string, VariationItem[]>,
): Promise<{
  session: SessionDetail;
  new_variations: Record<string, string[]>;
  merged_variations: Record<string, VariationItem[]>;
}> {
  return api(`/api/sessions/${encodeURIComponent(sessionId)}/variations`, {
    method: "POST",
    body: JSON.stringify({ elements, existing_items: existingItems }),
  });
}

export async function persistVariations(
  sessionId: string,
  items: Record<string, VariationItem[]>,
): Promise<SessionDetail> {
  return api(`/api/sessions/${encodeURIComponent(sessionId)}/variations`, {
    method: "PATCH",
    body: JSON.stringify({ items }),
  });
}

/** GenAI: pass `creative_levers` for levered perspective generation. Use `previewOnly` to avoid persisting. */
export async function generatePerspectives(
  sessionId: string,
  maxPerspectives = 30,
  creativeLevers?: CreativeLevers | null,
  options?: { previewOnly?: boolean },
): Promise<PerspectivesGenerateResponse> {
  const body: Record<string, unknown> = {
    max_perspectives: maxPerspectives,
    preview_only: options?.previewOnly ?? false,
  };
  if (creativeLevers != null) {
    body.creative_levers = creativeLevers;
  }
  return api(`/api/sessions/${encodeURIComponent(sessionId)}/perspectives`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

/** Unified pool: one GenAI call, all four cognitive tools (boldness / novelty / goal priority). */
export async function generatePerspectivePool(
  sessionId: string,
  body: {
    boldness: BoldnessTier;
    novelty: NoveltyTier;
    goal_priority: GoalPriorityPool;
    max_perspectives?: number;
    previewOnly?: boolean;
  },
): Promise<PerspectivesGenerateResponse> {
  return api(
    `/api/sessions/${encodeURIComponent(sessionId)}/perspectives/generate`,
    {
      method: "POST",
      body: JSON.stringify({
        boldness: body.boldness,
        novelty: body.novelty,
        goal_priority: body.goal_priority,
        max_perspectives: body.max_perspectives ?? 30,
        preview_only: body.previewOnly ?? false,
      }),
    },
  );
}

/** Persist selected perspectives after local exploration (replaces session list). */
export async function commitPerspectives(
  sessionId: string,
  body: {
    perspectives: Perspective[];
    creative_levers?: CreativeLevers | null;
    perspective_pool?: PerspectivePoolSettings | null;
  },
): Promise<SessionDetail> {
  return api(
    `/api/sessions/${encodeURIComponent(sessionId)}/perspectives/commit`,
    {
      method: "POST",
      body: JSON.stringify(body),
    },
  );
}

export async function addPerspective(
  sessionId: string,
  text = "",
): Promise<SessionDetail> {
  return api(
    `/api/sessions/${encodeURIComponent(sessionId)}/perspectives/manual`,
    {
      method: "POST",
      body: JSON.stringify({ text }),
    },
  );
}

export async function updatePerspective(
  sessionId: string,
  perspectiveId: string,
  body: {
    text?: string;
    part_ref?: string | null;
    action_ref?: string | null;
    selected?: boolean;
    promising?: boolean;
    pool_excluded?: boolean;
    position?: { x: number; y: number };
    is_ghost?: boolean;
  },
): Promise<SessionDetail> {
  return api(
    `/api/sessions/${encodeURIComponent(sessionId)}/perspectives/${encodeURIComponent(perspectiveId)}`,
    { method: "PATCH", body: JSON.stringify(body) },
  );
}

export async function proposeChanges(
  sessionId: string,
  body?: { max_proposals?: number },
): Promise<ProposeChangesResponse> {
  return api(`/api/sessions/${encodeURIComponent(sessionId)}/propose-changes`, {
    method: "POST",
    body: JSON.stringify({
      max_proposals: body?.max_proposals ?? 6,
    }),
  });
}

export async function deletePerspective(
  sessionId: string,
  perspectiveId: string,
): Promise<SessionDetail> {
  return api(
    `/api/sessions/${encodeURIComponent(sessionId)}/perspectives/${encodeURIComponent(perspectiveId)}`,
    { method: "DELETE" },
  );
}

export async function patchPerspectiveSelection(
  sessionId: string,
  perspectiveId: string,
  selected: boolean,
): Promise<SessionDetail> {
  return api(
    `/api/sessions/${encodeURIComponent(sessionId)}/perspectives/${encodeURIComponent(perspectiveId)}/selection`,
    {
      method: "PATCH",
      body: JSON.stringify({ selected }),
    },
  );
}

export async function selectPerspectives(
  sessionId: string,
  perspective_ids: string[],
): Promise<{ session: SessionDetail }> {
  return api(
    `/api/sessions/${encodeURIComponent(sessionId)}/perspectives/select`,
    {
      method: "POST",
      body: JSON.stringify({ perspective_ids }),
    },
  );
}

export async function generateInsights(sessionId: string): Promise<{
  session: SessionDetail;
  insights: InsightRecord[];
}> {
  return api(`/api/sessions/${encodeURIComponent(sessionId)}/insights`, {
    method: "POST",
  });
}

export async function generateInvention(sessionId: string): Promise<{
  session: SessionDetail;
  invention: import("./types").InventionArtifact;
}> {
  return api(`/api/sessions/${encodeURIComponent(sessionId)}/inventions`, {
    method: "POST",
  });
}

export async function generateEnlightenment(sessionId: string): Promise<{
  session: SessionDetail;
  enlightenment: import("./types").EnlightenmentArtifact;
}> {
  return api(`/api/sessions/${encodeURIComponent(sessionId)}/enlightenment`, {
    method: "POST",
  });
}
