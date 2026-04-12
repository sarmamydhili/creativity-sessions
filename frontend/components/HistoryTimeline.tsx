import type { HistoryEntry } from "@/lib/types";

function payloadPreview(payload: Record<string, unknown>): string {
  try {
    return JSON.stringify(payload, null, 2);
  } catch {
    return String(payload);
  }
}

export function HistoryTimeline({ entries }: { entries: HistoryEntry[] }) {
  return (
    <div className="stack">
      {entries.map((h) => (
        <div key={h.entry_id} className="card">
          <div className="row">
            <strong>{h.kind}</strong>
            <span className="muted">
              {new Date(h.created_at).toLocaleString()}
            </span>
          </div>
          <pre
            style={{
              margin: "0.5rem 0 0",
              fontSize: "0.8rem",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
            }}
          >
            {payloadPreview(h.payload)}
          </pre>
        </div>
      ))}
    </div>
  );
}
