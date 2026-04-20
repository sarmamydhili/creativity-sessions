"use client";

import { useEffect, useState } from "react";
import type { Perspective } from "@/lib/types";

type PerspectiveNodeData = {
  perspective: Perspective;
  onToggleSelected: (id: string, checked: boolean) => void;
  onTextChange: (id: string, text: string) => void;
  onTextSave: (id: string) => void;
  onDelete: (id: string) => void;
};

function parseRankScore(value: number | string | null | undefined): number | null {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : Number.parseFloat(String(value));
  if (Number.isNaN(n)) return null;
  return Math.max(0, Math.min(1, n));
}

function rankPercentLabel(score: number): string {
  return `${Math.round(score * 100)}%`;
}

function RankStars({ score }: { score: number }) {
  const s = Math.max(0, Math.min(1, score));
  const pct = rankPercentLabel(s);
  return (
    <span
      className="inline-flex items-center gap-px"
      title={`${pct} — compared to other ideas in this batch (not a correctness score).`}
      aria-label={`Rank about ${pct} within this batch`}
    >
      {[0, 1, 2, 3, 4].map((i) => {
        const fill = Math.min(1, Math.max(0, s * 5 - i));
        return (
          <span
            key={i}
            className="relative inline-block h-[1.05em] w-[0.92em] select-none text-[13px] leading-none sm:text-sm"
          >
            <span className="absolute left-0 top-0 text-slate-300" aria-hidden>
              ★
            </span>
            <span
              className="absolute left-0 top-0 h-full overflow-hidden text-amber-500"
              style={{ width: `${fill * 100}%` }}
              aria-hidden
            >
              <span className="inline-block whitespace-nowrap">★</span>
            </span>
          </span>
        );
      })}
    </span>
  );
}

export function PerspectiveNode({ data }: { data: PerspectiveNodeData }) {
  const p = data?.perspective;
  if (!p) return null;
  const text = p.text || p.description || "";
  const [localText, setLocalText] = useState(text);
  useEffect(() => {
    setLocalText(text);
  }, [p.perspective_id, text]);
  const rank = parseRankScore(p.rank_score);
  const approvedGhost = Boolean(p.approved_from_ghost);
  const cardClass = approvedGhost
    ? "w-[320px] rounded-xl border border-violet-400 bg-violet-50/70 p-3 shadow-md ring-1 ring-violet-200"
    : "w-[320px] rounded-xl border border-slate-300 bg-white p-3 shadow-md";
  const sourceTextClass = approvedGhost
    ? "mb-1 text-xs font-semibold uppercase tracking-wide text-violet-700"
    : "mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500";
  return (
    <div className={cardClass}>
      <div className="mb-1 flex items-start justify-between gap-2">
        <div className={sourceTextClass}>{p.source_tool || "perspective"}</div>
        <button
          type="button"
          className="flex h-8 w-8 items-center justify-center rounded-md border border-rose-700 bg-rose-600 text-lg font-extrabold leading-none text-white hover:bg-rose-700 focus:outline-none focus:ring-2 focus:ring-rose-300"
          onClick={() => {
            if (!window.confirm("Delete this perspective?")) return;
            data.onDelete(p.perspective_id);
          }}
          title="Delete perspective"
          aria-label="Delete perspective"
        >
          ×
        </button>
      </div>
      {approvedGhost ? (
        <div className="mb-1 inline-flex rounded-full border border-violet-300 bg-violet-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-700">
          Approved AI Suggestion
        </div>
      ) : null}
      {p.title ? <div className="mb-1 text-sm font-semibold text-slate-900">{p.title}</div> : null}
      {rank != null ? (
        <div className="mb-1 flex items-center justify-between text-xs text-slate-600">
          <span className="font-medium text-slate-500">Rank</span>
          <RankStars score={rank} />
        </div>
      ) : null}
      <textarea
        className="nodrag nowheel min-h-[84px] w-full resize-none rounded-md border border-slate-200 bg-white p-2 text-sm text-slate-700 outline-none ring-indigo-200 focus:ring"
        value={localText}
        onChange={(e) => {
          setLocalText(e.target.value);
        }}
        onBlur={() => {
          data.onTextChange(p.perspective_id, localText);
          data.onTextSave(p.perspective_id);
        }}
      />
      <label className="mt-3 flex items-center gap-2 text-xs text-slate-600">
        <input
          type="checkbox"
          checked={Boolean(p.selected)}
          onChange={(e) => data.onToggleSelected(p.perspective_id, e.target.checked)}
        />
        Use for insights
      </label>
    </div>
  );
}

export type { PerspectiveNodeData };
