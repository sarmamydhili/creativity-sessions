"use client";

import type { GhostProposal } from "@/lib/types";

type GhostNodeData = {
  proposal: GhostProposal;
  onApprove: (proposalId: string) => void;
  onReject: (proposalId: string) => void;
};

export function GhostNode({ data }: { data: GhostNodeData }) {
  const g = data?.proposal;
  if (!g) return null;
  const p = g.card;
  const text = p.text || p.description || "";
  const preview = text.length > 220 ? `${text.slice(0, 220)}…` : text;
  return (
    <div className="w-[320px] rounded-xl border-2 border-dashed border-cyan-400 bg-slate-950/90 p-3 text-cyan-100 shadow-[0_0_0_1px_rgba(34,211,238,0.5),0_10px_28px_rgba(6,182,212,0.22)]">
      <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-cyan-300">
        Ghost · {g.proposal_kind === "reposition" ? "Reposition" : "Bridge card"}
      </div>
      {p.title ? <div className="mb-1 text-sm font-semibold text-cyan-50">{p.title}</div> : null}
      <p className="text-sm text-cyan-100/90">{preview}</p>
      {g.rationale ? (
        <p className="mt-2 rounded border border-cyan-500/35 bg-cyan-950/25 px-2 py-1 text-xs text-cyan-200/95">
          {g.rationale}
        </p>
      ) : null}
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          className="rounded-lg bg-emerald-500 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-600"
          onClick={() => data.onApprove(g.proposal_id)}
        >
          ✓ Approve
        </button>
        <button
          type="button"
          className="rounded-lg border border-cyan-500/60 bg-transparent px-2.5 py-1.5 text-xs font-semibold text-cyan-100 hover:bg-cyan-900/30"
          onClick={() => data.onReject(g.proposal_id)}
        >
          ✕ Reject
        </button>
      </div>
    </div>
  );
}

export type { GhostNodeData };
