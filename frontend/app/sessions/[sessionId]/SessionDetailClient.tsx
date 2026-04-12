"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { deleteSession, getSession } from "@/lib/api";
import type { SessionDetail } from "@/lib/types";
import { SessionJourney } from "@/components/SessionJourney";

export function SessionDetailClient({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const [session, setSession] = useState<SessionDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const s = await getSession(sessionId);
      setSession(s);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
      setSession(null);
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading && !session) {
    return <p className="muted">Loading session…</p>;
  }
  if (error && !session) {
    return (
      <div>
        <p className="error">{error}</p>
        <Link href="/sessions">Back to list</Link>
      </div>
    );
  }
  if (!session) return null;

  async function handleDelete() {
    if (
      !window.confirm(
        "Delete this session permanently? This removes it from the database and cannot be undone.",
      )
    ) {
      return;
    }
    setDeleting(true);
    setError(null);
    try {
      await deleteSession(sessionId);
      router.push("/sessions");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="stack">
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <Link href="/sessions">← Sessions</Link>
        <button
          type="button"
          className="muted"
          style={{
            border: "1px solid var(--border)",
            background: "transparent",
            color: "var(--text)",
            padding: "0.35rem 0.75rem",
            borderRadius: 6,
            cursor: deleting ? "wait" : "pointer",
          }}
          disabled={deleting}
          onClick={() => void handleDelete()}
        >
          {deleting ? "Deleting…" : "Delete session"}
        </button>
      </div>
      {error ? <p className="error">{error}</p> : null}
      <h1>{session.title || "Untitled session"}</h1>
      <SessionJourney
        initial={session}
        sessionId={session.session_id}
        onSessionChange={setSession}
      />
    </div>
  );
}
