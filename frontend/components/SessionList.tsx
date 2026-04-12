"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { deleteSession } from "@/lib/api";
import type { SessionSummary } from "@/lib/types";

function stepLabel(s: string): string {
  return s.replace(/_/g, " ");
}

export function SessionList({ items: initialItems }: { items: SessionSummary[] }) {
  const router = useRouter();
  const [items, setItems] = useState(initialItems);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    setItems(initialItems);
  }, [initialItems]);

  async function remove(id: string) {
    if (
      !window.confirm(
        "Delete this session permanently? This removes it from the database and cannot be undone.",
      )
    ) {
      return;
    }
    setBusyId(id);
    try {
      await deleteSession(id);
      setItems((prev) => prev.filter((s) => s.session_id !== id));
      router.refresh();
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setBusyId(null);
    }
  }

  if (items.length === 0) {
    return (
      <p className="muted">
        No sessions yet. Start with a problem statement about your users (e.g.
        joggers and hydration).
      </p>
    );
  }
  return (
    <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
      {items.map((s) => (
        <li key={s.session_id} className="card">
          <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
            <Link href={`/sessions/${s.session_id}`}>
              <strong>{s.title || "Untitled"}</strong>
            </Link>
            <button
              type="button"
              className="muted"
              style={{
                border: "1px solid var(--border)",
                background: "transparent",
                color: "var(--text)",
                padding: "0.25rem 0.5rem",
                borderRadius: 6,
                fontSize: "0.8rem",
                cursor: busyId === s.session_id ? "wait" : "pointer",
              }}
              disabled={busyId !== null}
              onClick={() => void remove(s.session_id)}
            >
              {busyId === s.session_id ? "…" : "Delete"}
            </button>
          </div>
          <div className="muted" style={{ marginTop: "0.35rem" }}>
            {s.problem_statement.slice(0, 120)}
            {s.problem_statement.length > 120 ? "…" : ""}
          </div>
          <div className="muted">
            Step: {stepLabel(s.current_step)} · {s.status} · Updated{" "}
            {new Date(s.updated_at).toLocaleString()}
          </div>
        </li>
      ))}
    </ul>
  );
}
