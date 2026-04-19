"use client";

import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  type Node,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useEffect, useMemo, useState } from "react";
import type { GhostProposal, Perspective } from "@/lib/types";
import { GhostNode, type GhostNodeData } from "./GhostNode";
import { PerspectiveNode, type PerspectiveNodeData } from "./PerspectiveNode";

type Props = {
  perspectives: Perspective[];
  proposals: GhostProposal[];
  loading: boolean;
  onAskSuggestions: () => void;
  onPerspectiveMove: (id: string, position: { x: number; y: number }) => void;
  onGhostMove: (proposalId: string, position: { x: number; y: number }) => void;
  onToggleSelected: (id: string, selected: boolean) => void;
  onApproveProposal: (proposalId: string) => void;
  onRejectProposal: (proposalId: string) => void;
};

const nodeTypes: any = {
  perspective: PerspectiveNode,
  ghost: GhostNode,
};

function fallbackPosition(index: number): { x: number; y: number } {
  const col = index % 3;
  const row = Math.floor(index / 3);
  return { x: col * 360, y: row * 220 };
}

export function PerspectiveCanvas({
  perspectives,
  proposals,
  loading,
  onAskSuggestions,
  onPerspectiveMove,
  onGhostMove,
  onToggleSelected,
  onApproveProposal,
  onRejectProposal,
}: Props) {
  const [activeNodeId, setActiveNodeId] = useState<string | null>(null);
  const [rf, setRf] = useState<any>(null);

  const perspectiveNodes: Node<PerspectiveNodeData>[] = useMemo(
    () =>
      perspectives.map((p, idx) => ({
        id: p.perspective_id,
        type: "perspective",
        position: p.position ?? fallbackPosition(idx),
        draggable: true,
        zIndex: activeNodeId === p.perspective_id ? 500 : 100,
        data: {
          perspective: p,
          onToggleSelected,
        },
      })),
    [perspectives, activeNodeId, onToggleSelected],
  );
  const ghostNodes: Node<GhostNodeData>[] = useMemo(
    () =>
      proposals.map((g, idx) => ({
        id: `proposal:${g.proposal_id}`,
        type: "ghost",
        position: g.card.position ?? { x: 120 + idx * 30, y: 120 + idx * 20 },
        draggable: true,
        zIndex: activeNodeId === `proposal:${g.proposal_id}` ? 520 : 120,
        data: {
          proposal: g,
          onApprove: onApproveProposal,
          onReject: onRejectProposal,
        },
      })),
    [proposals, activeNodeId, onApproveProposal, onRejectProposal],
  );

  const nodes = useMemo(() => [...perspectiveNodes, ...ghostNodes], [perspectiveNodes, ghostNodes]);
  const nodesKey = useMemo(
    () =>
      nodes
        .map((n) => `${n.id}:${Math.round(n.position.x)}:${Math.round(n.position.y)}`)
        .join("|"),
    [nodes],
  );

  const handleDragStop = (_evt: unknown, node: any) => {
    const pos = { x: node.position.x, y: node.position.y };
    if (node.id.startsWith("proposal:")) {
      onGhostMove(node.id.replace("proposal:", ""), pos);
      return;
    }
    onPerspectiveMove(node.id, pos);
  };

  useEffect(() => {
    if (!nodes.length || !rf) return;
    const t = window.setTimeout(() => {
      rf.fitView({ padding: 0.2, duration: 350 });
    }, 20);
    return () => window.clearTimeout(t);
  }, [nodesKey, rf, nodes.length]);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-3 py-2">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Perspective Canvas</h3>
          <p className="text-xs text-slate-600">
            Drag cards to organize ideas. Ghost suggestions appear on a separate layer.
          </p>
        </div>
        <button
          type="button"
          className="rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
          disabled={loading}
          onClick={onAskSuggestions}
        >
          {loading ? "…" : "Ask Agent for Suggestions"}
        </button>
      </div>
      <div className="h-[calc(100vh-240px)] min-h-[560px] max-h-[980px] w-full">
        <ReactFlow
          nodes={nodes}
          edges={[]}
          nodeTypes={nodeTypes}
          onNodeDragStop={handleDragStop}
          onNodeClick={(_e, node) => setActiveNodeId(node.id)}
          onPaneClick={() => setActiveNodeId(null)}
          elevateNodesOnSelect
          fitView
          onInit={(instance) => setRf(instance)}
        >
          <MiniMap
            pannable
            zoomable
            nodeColor={(n) => (String(n.id).startsWith("proposal:") ? "#0ea5e9" : "#334155")}
            maskColor="rgba(15,23,42,0.08)"
          />
          <Controls />
          <Background gap={18} color="#d4d4d8" />
        </ReactFlow>
      </div>
    </div>
  );
}
