"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { listSessions } from "@/lib/api";
import type { SessionSummary } from "@/lib/types";

const TEMPLATES = [
  {
    title: "Product discovery",
    blurb: "Users struggle to adopt a new habit around your core job-to-be-done.",
  },
  {
    title: "Operations & waste",
    blurb: "Reduce friction in a shared space where behavior and policy collide.",
  },
  {
    title: "Learning experience",
    blurb: "Learners face motivation and time constraints — find the lever moment.",
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
          SPARK
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">
          Transform Your Thinking
        </h1>
        <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-slate-600">
          A guided, playful loop: frame the problem with SPARK, remix ideas with
          cognitive tools, then capture insights and inventions.
        </p>
        <Link
          href="/sessions/new"
          className="mt-8 inline-flex items-center justify-center rounded-2xl bg-spark-situation px-8 py-3.5 text-sm font-semibold text-white shadow-soft transition hover:opacity-95"
        >
          Start new session
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
                href={`/sessions/new?template=${encodeURIComponent(t.title)}`}
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
