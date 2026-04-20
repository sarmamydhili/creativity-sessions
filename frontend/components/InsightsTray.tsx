"use client";

import type { Perspective, SessionDetail } from "@/lib/types";

export type InsightsTrayProps = {
  session: SessionDetail;
  selectedPerspectives: Perspective[];
  promisingPerspectives: Perspective[];
  /** True while exploring a local perspective pool before commit. */
  perspectiveDraftActive?: boolean;
};

export function InsightsTray({
  session,
  selectedPerspectives,
  promisingPerspectives,
  perspectiveDraftActive = false,
}: InsightsTrayProps) {
  const insights = session.insights ?? [];
  const inv = session.invention;
  const enl = session.enlightenment;
  const rec = session.last_recommended_perspective?.trim();
  const leverInsights = session.last_insight_candidates ?? [];

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-card">
      {perspectiveDraftActive ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
          <strong>Draft pool.</strong> Save your pool in the main workspace, then use
          <strong> Generate insights</strong> above the invention section.
        </p>
      ) : null}
      {selectedPerspectives.length > 0 ? (
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            Selected ideas
          </p>
          <ul className="mt-2 max-h-28 space-y-1.5 overflow-y-auto text-xs text-slate-700">
            {selectedPerspectives.map((p) => (
              <li
                key={p.perspective_id}
                className="rounded-lg bg-blue-50/80 px-2 py-1.5 line-clamp-3 ring-1 ring-blue-100"
              >
                {(p.text || p.description || "").slice(0, 200)}
                {(p.text || p.description || "").length > 200 ? "…" : ""}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="text-xs text-slate-500">
          No perspectives selected — insights will use the top 10 in-pool cards by rank
          unless you mark selections in the canvas.
        </p>
      )}

      {promisingPerspectives.length > 0 ? (
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            Marked promising
          </p>
          <ul className="mt-2 max-h-24 space-y-1.5 overflow-y-auto text-xs text-slate-700">
            {promisingPerspectives.map((p) => (
              <li
                key={p.perspective_id}
                className="rounded-lg bg-emerald-50/80 px-2 py-1.5 line-clamp-2 ring-1 ring-emerald-100"
              >
                {(p.text || p.description || "").slice(0, 140)}
                {(p.text || p.description || "").length > 140 ? "…" : ""}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {rec || leverInsights.length > 0 ? (
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            Latest lever output
          </p>
          {rec ? (
            <p className="mt-2 rounded-lg bg-violet-50/80 px-2 py-2 text-xs leading-snug text-slate-800 ring-1 ring-violet-100">
              <span className="font-semibold text-violet-900">Recommended · </span>
              {rec}
            </p>
          ) : null}
          {leverInsights.length > 0 ? (
            <ul className="mt-2 space-y-1 text-xs text-slate-700">
              {leverInsights.map((t, i) => (
                <li key={i} className="rounded border border-slate-100 bg-slate-50/90 px-2 py-1.5">
                  {t}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
          Insights
        </p>
        {insights.length === 0 ? (
          <p className="mt-1 text-xs text-slate-500">None yet.</p>
        ) : (
          <ul className="mt-2 space-y-2 text-sm text-slate-800">
            {insights.map((ins) => (
              <li
                key={ins.insight_id}
                className="rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2 leading-snug"
              >
                {ins.text}
              </li>
            ))}
          </ul>
        )}
      </div>

      {inv ? (
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            Invention
          </p>
          <p className="mt-1 text-sm font-semibold text-slate-900 line-clamp-2">
            {inv.title}
          </p>
          <p className="mt-1 text-xs text-slate-600 line-clamp-3">{inv.description}</p>
        </div>
      ) : null}

      {enl ? (
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            Learning
          </p>
          <p className="mt-1 text-xs leading-relaxed text-slate-700 line-clamp-4">
            {enl.summary}
          </p>
        </div>
      ) : null}
    </div>
  );
}
