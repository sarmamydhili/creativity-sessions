"use client";

import type { Perspective, SessionDetail } from "@/lib/types";

export type InsightsTrayProps = {
  session: SessionDetail;
  progressPercent: number;
  nextHint: string;
  selectedPerspectives: Perspective[];
  insightsLocked: boolean;
  inventionLocked: boolean;
  loading: string | null;
  onGenerateInsights: () => void;
  onGenerateInvention: () => void;
  onGenerateEnlightenment: () => void;
  onJumpToInvention?: () => void;
};

export function InsightsTray({
  session,
  progressPercent,
  nextHint,
  selectedPerspectives,
  insightsLocked,
  inventionLocked,
  loading,
  onGenerateInsights,
  onGenerateInvention,
  onGenerateEnlightenment,
  onJumpToInvention,
}: InsightsTrayProps) {
  const insights = session.insights ?? [];

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-card">
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

      <div className="rounded-xl bg-amber-50/80 px-3 py-2 text-xs leading-relaxed text-amber-950 ring-1 ring-amber-100">
        <span className="font-semibold text-amber-800">Suggested next · </span>
        {nextHint}
      </div>

      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
          Selected for synthesis
        </p>
        {selectedPerspectives.length === 0 ? (
          <p className="mt-1 text-xs text-slate-500">
            No selection — insights will use all perspectives.
          </p>
        ) : (
          <ul className="mt-2 max-h-32 space-y-1.5 overflow-y-auto text-xs text-slate-700">
            {selectedPerspectives.map((p) => (
              <li
                key={p.perspective_id}
                className="rounded-lg bg-slate-50 px-2 py-1.5 line-clamp-2"
              >
                {(p.text || p.description || "").slice(0, 120)}
                {(p.text || p.description || "").length > 120 ? "…" : ""}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
          Live insights
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
          className="w-full rounded-xl border border-slate-200 bg-white py-2.5 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50 disabled:opacity-45"
          disabled={inventionLocked}
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
