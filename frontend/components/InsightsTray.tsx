"use client";

import type { Perspective, SessionDetail } from "@/lib/types";

export type InsightsTrayProps = {
  session: SessionDetail;
  progressPercent: number;
  selectedPerspectives: Perspective[];
  promisingPerspectives: Perspective[];
  /** True while exploring a local perspective pool before commit. */
  perspectiveDraftActive?: boolean;
  insightsLocked: boolean;
  inventionLocked: boolean;
  inventionLockTitle?: string;
  loading: string | null;
  onGenerateInsights: () => void;
  onGenerateInvention: () => void;
  onGenerateEnlightenment: () => void;
  onJumpToInvention?: () => void;
};

export function InsightsTray({
  session,
  progressPercent,
  selectedPerspectives,
  promisingPerspectives,
  perspectiveDraftActive = false,
  insightsLocked,
  inventionLocked,
  inventionLockTitle,
  loading,
  onGenerateInsights,
  onGenerateInvention,
  onGenerateEnlightenment,
  onJumpToInvention,
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
          <strong>Draft pool.</strong> Commit selected perspectives in the main
          workspace to save them and unlock insights here.
        </p>
      ) : null}
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
          Creativity progress
        </p>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full rounded-full bg-gradient-to-r from-spark-situation via-spark-pieces to-spark-actions transition-all duration-500"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
        <p className="mt-1 text-right text-xs text-slate-500">{progressPercent}%</p>
      </div>

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
          No perspectives selected — insights will use all generated cards unless
          you mark selections in the canvas.
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

      <div className="flex flex-col gap-2 border-t border-slate-100 pt-3">
        <button
          type="button"
          className="w-full rounded-xl bg-spark-situation py-2.5 text-sm font-semibold text-white shadow-soft disabled:opacity-45"
          disabled={insightsLocked}
          title={
            insightsLocked && session.perspectives.length === 0
              ? "Add perspectives first."
              : "Synthesize insights from selected perspectives (or all)."
          }
          onClick={onGenerateInsights}
        >
          {loading === "ins" ? "…" : "Generate insights"}
        </button>
        <button
          type="button"
          className="w-full cursor-pointer rounded-xl border border-slate-200 bg-white py-2.5 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          disabled={inventionLocked}
          title={
            inventionLocked
              ? (inventionLockTitle ??
                "Generate insights first, then you can build an invention.")
              : "Propose one invention concept from your insights."
          }
          onClick={onGenerateInvention}
        >
          {loading === "inv" ? "…" : "Build invention"}
        </button>
        {onJumpToInvention ? (
          <button
            type="button"
            className="w-full py-1 text-xs text-slate-500 underline hover:text-spark-role"
            onClick={onJumpToInvention}
          >
            View invention section
          </button>
        ) : null}
        {session.invention ? (
          <button
            type="button"
            className="w-full rounded-xl py-2 text-xs font-medium text-spark-role hover:underline disabled:opacity-45"
            disabled={loading !== null}
            onClick={onGenerateEnlightenment}
          >
            {loading === "enl" ? "…" : "Generate enlightenment"}
          </button>
        ) : null}
      </div>
    </div>
  );
}
