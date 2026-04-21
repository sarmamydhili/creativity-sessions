"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { listSessions } from "@/lib/api";
import type { SessionSummary } from "@/lib/types";

const TEMPLATES = [
  {
    title: "Bedroom refresh",
    blurb: "Refresh my bedroom without spending much.",
    mode: "quick",
    project: "home_decor",
  },
  {
    title: "Birthday surprise",
    blurb: "Plan a memorable birthday surprise with a clear timeline.",
    mode: "guided",
    project: "event_celebration",
  },
  {
    title: "Student study app",
    blurb: "Create an app concept that helps students build better study habits.",
    mode: "studio",
    project: "product_app",
  },
] as const;

export function HomeDashboard() {
  const [recent, setRecent] = useState<SessionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void listSessions({ limit: 8 })
      .then((res) => {
        if (!cancelled) {
          setRecent(res.items);
          setErr(null);
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setErr(e instanceof Error ? e.message : "Failed to load sessions");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="mx-auto max-w-3xl px-4 pb-8 pt-10">
      <header className="text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-spark-situation via-spark-pieces to-spark-actions text-2xl font-black text-white shadow-card">
          S
        </div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
          Creativity copilot
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">
          Simple on the surface, deep underneath
        </h1>
        <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-slate-600">
          Start with quick ideas for everyday needs, switch to guided flow when you
          want structure, and open Studio when you need full creative depth.
        </p>
        <Link
          href="/sessions/new?mode=quick&project=personal_project"
          className="mt-8 inline-flex items-center justify-center rounded-2xl bg-spark-situation px-8 py-3.5 text-sm font-semibold text-white shadow-soft transition hover:opacity-95"
        >
          Start with quick ideas
        </Link>
      </header>

      <section className="mt-14">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">
          Recent sessions
        </h2>
        {err ? (
          <p className="mt-3 text-sm text-red-600">{err}</p>
        ) : loading ? (
          <p className="mt-3 text-sm text-slate-500">Loading…</p>
        ) : recent.length === 0 ? (
          <p className="mt-3 rounded-xl border border-dashed border-slate-200 bg-white px-4 py-6 text-sm text-slate-500">
            No sessions yet. Start one to see it here.
          </p>
        ) : (
          <ul className="mt-4 space-y-2">
            {recent.map((s) => (
              <li key={s.session_id}>
                <Link
                  href={`/sessions/${s.session_id}`}
                  className="block rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-card transition hover:border-slate-300"
                >
                  <span className="font-medium text-slate-900">
                    {s.title || "Untitled session"}
                  </span>
                  <span className="mt-1 block text-xs text-slate-500 line-clamp-2">
                    {s.problem_statement}
                  </span>
                  <span className="mt-2 block text-[10px] uppercase text-slate-400">
                    {s.current_step.replace(/_/g, " ")}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-4 text-center text-sm">
          <Link href="/sessions" className="font-medium text-spark-situation hover:underline">
            View all sessions
          </Link>
        </p>
      </section>

      <section className="mt-12">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">
          Templates
        </h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {TEMPLATES.map((t) => (
            <div
              key={t.title}
              className="rounded-xl border border-slate-200 bg-white p-4 shadow-card"
            >
              <h3 className="font-semibold text-slate-900">{t.title}</h3>
              <p className="mt-2 text-xs leading-relaxed text-slate-600">
                {t.blurb}
              </p>
              <Link
                  href={`/sessions/new?template=${encodeURIComponent(t.title)}&mode=${encodeURIComponent(t.mode)}&project=${encodeURIComponent(t.project)}`}
                className="mt-3 inline-block text-xs font-medium text-spark-pieces hover:underline"
              >
                Use as inspiration →
              </Link>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
