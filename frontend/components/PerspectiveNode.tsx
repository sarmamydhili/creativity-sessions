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
  return (
    <div className="w-[320px] rounded-xl border border-slate-300 bg-white p-3 shadow-md">
      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
        {p.source_tool || "perspective"}
      </div>
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
