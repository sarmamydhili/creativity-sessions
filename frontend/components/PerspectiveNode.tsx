"use client";

import type { Perspective } from "@/lib/types";

type PerspectiveNodeData = {
  perspective: Perspective;
  onToggleSelected: (id: string, checked: boolean) => void;
};

export function PerspectiveNode({ data }: { data: PerspectiveNodeData }) {
  const p = data?.perspective;
  if (!p) return null;
  const text = p.text || p.description || "";
  const preview = text.length > 220 ? `${text.slice(0, 220)}…` : text;
  const approvedGhost = Boolean(p.approved_from_ghost);
  const cardClass = approvedGhost
    ? "w-[320px] rounded-xl border border-violet-400 bg-violet-50/70 p-3 shadow-md ring-1 ring-violet-200"
    : "w-[320px] rounded-xl border border-slate-300 bg-white p-3 shadow-md";
  const sourceTextClass = approvedGhost
    ? "mb-1 text-xs font-semibold uppercase tracking-wide text-violet-700"
    : "mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500";
  return (
    <div className={cardClass}>
      <div className={sourceTextClass}>
        {p.source_tool || "perspective"}
      </div>
      {approvedGhost ? (
        <div className="mb-1 inline-flex rounded-full border border-violet-300 bg-violet-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-700">
          Approved AI Suggestion
        </div>
      ) : null}
      {p.title ? <div className="mb-1 text-sm font-semibold text-slate-900">{p.title}</div> : null}
      <p className="text-sm text-slate-700">{preview}</p>
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
