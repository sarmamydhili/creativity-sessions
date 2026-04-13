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
    return (
      <p className="rounded-xl bg-white px-4 py-8 text-center text-sm text-slate-500 shadow-card">
        Loading session…
      </p>
    );
  }
  if (error && !session) {
    return (
      <div className="rounded-xl border border-red-100 bg-red-50/80 px-4 py-6 text-red-800">
        <p className="font-medium">{error}</p>
        <Link href="/sessions" className="mt-3 inline-block text-sm underline">
          Back to list
        </Link>
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
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-card sm:items-center sm:p-5">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            SPARK workspace
          </p>
          <h1 className="mt-1 text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
            {session.title || "Untitled session"}
          </h1>
          <p className="mt-1 text-xs text-slate-500 line-clamp-2 sm:text-sm">
            {session.problem_statement}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/sessions"
            className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
          >
            All sessions
          </Link>
          <button
            type="button"
            className="rounded-xl border border-red-200 bg-white px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
            disabled={deleting}
            onClick={() => void handleDelete()}
          >
            {deleting ? "Deleting…" : "Delete"}
          </button>
        </div>
      </div>
      {error ? (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900" role="alert">
          {error}
        </p>
      ) : null}
      <SessionJourney
        initial={session}
        sessionId={session.session_id}
        onSessionChange={setSession}
      />
    </div>
  );
}
