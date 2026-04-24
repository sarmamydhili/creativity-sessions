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
    <ul className="m-0 list-none space-y-3 p-0">
      {items.map((s) => (
        <li
          key={s.session_id}
          className="rounded-2xl border border-slate-200 bg-white p-4 shadow-card"
        >
          <div className="flex flex-wrap items-start justify-between gap-2">
            <Link
              href={`/sessions/${s.session_id}`}
              className="font-semibold text-slate-900 hover:text-spark-situation"
            >
              {s.title || "Untitled"}
            </Link>
            <button
              type="button"
              className="rounded-lg border border-rose-700 bg-rose-600 px-2 py-1 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
              disabled={busyId !== null}
              onClick={() => void remove(s.session_id)}
            >
              {busyId === s.session_id ? "…" : "Delete"}
            </button>
          </div>
          <p className="mt-2 text-sm text-slate-600 line-clamp-2">
            {s.problem_statement}
          </p>
          <p className="mt-2 text-xs text-slate-400">
            Step: {stepLabel(s.current_step)} · {s.status} · Updated{" "}
            {new Date(s.updated_at).toLocaleString()}
          </p>
        </li>
      ))}
    </ul>
  );
}
