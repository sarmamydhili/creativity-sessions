import type {
  CreativeLevers,
  PerspectivesGenerateResponse,
  SessionDetail,
  SessionListResponse,
  VariationItem,
  InsightRecord,
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

/** GenAI: classic matrix, or pass `creative_levers` for CREATIVE LEVER CONTROL. */
export async function generatePerspectives(
  sessionId: string,
  maxPerspectives = 16,
  creativeLevers?: CreativeLevers | null,
): Promise<PerspectivesGenerateResponse> {
  const body: Record<string, unknown> = { max_perspectives: maxPerspectives };
  if (creativeLevers != null) {
    body.creative_levers = creativeLevers;
  }
  return api(`/api/sessions/${encodeURIComponent(sessionId)}/perspectives`, {
    method: "POST",
    body: JSON.stringify(body),
  });
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
  },
): Promise<SessionDetail> {
  return api(
    `/api/sessions/${encodeURIComponent(sessionId)}/perspectives/${encodeURIComponent(perspectiveId)}`,
    { method: "PATCH", body: JSON.stringify(body) },
  );
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
