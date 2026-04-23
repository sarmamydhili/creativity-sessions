"use client";

import { useState } from "react";
import type { InsightRecord, InventionArtifact, Perspective } from "@/lib/types";

type FlowMode = "quick" | "guided" | "studio";
type FlowStep = { label: string; done: boolean };

type Props = {
  flowMode: FlowMode;
  progressPercent: number;
  selectedPerspectives: Perspective[];
  insights: InsightRecord[];
  invention: InventionArtifact | null;
  flowStatus: {
    hasSpark: boolean;
    hasPerspectives: boolean;
    hasStakeholderFeatureCards: boolean;
    hasInsights: boolean;
    hasBuildInputs: boolean;
    hasInvention: boolean;
  };
  perspectiveDraftActive?: boolean;
  collapsed: boolean;
  onToggleCollapsed: () => void;
};

function buildFlowSteps(flowMode: FlowMode, status: Props["flowStatus"]): FlowStep[] {
  if (flowMode === "quick") {
    return [
      { label: "Problem", done: true },
      { label: "Quick Frame", done: Boolean(status.hasSpark) },
      { label: "Generate Ideas", done: Boolean(status.hasPerspectives) },
      { label: "Refine Picks", done: Boolean(status.hasPerspectives) },
      { label: "Insights", done: Boolean(status.hasInsights) },
      { label: "Build Concept", done: Boolean(status.hasInvention) },
    ];
  }
  if (flowMode === "guided") {
    return [
      { label: "Problem", done: true },
      { label: "Understand Challenge", done: Boolean(status.hasSpark) },
      { label: "Idea Board", done: Boolean(status.hasPerspectives) },
      { label: "Generate Ideas", done: Boolean(status.hasPerspectives) },
      { label: "Canvas", done: Boolean(status.hasPerspectives) },
      { label: "Insights", done: Boolean(status.hasInsights) },
      { label: "Shape Product Concept", done: Boolean(status.hasBuildInputs) },
      { label: "Build Product Concept", done: Boolean(status.hasInvention) },
    ];
  }
  return [
    { label: "Problem", done: true },
    { label: "Understand Challenge", done: Boolean(status.hasSpark) },
    { label: "Idea Board", done: Boolean(status.hasPerspectives) },
    { label: "Generate Ideas", done: Boolean(status.hasPerspectives) },
    { label: "Studio Canvas", done: Boolean(status.hasPerspectives) },
    {
      label: "Stakeholder Feature Cards",
      done: Boolean(status.hasStakeholderFeatureCards),
    },
    { label: "Insights", done: Boolean(status.hasInsights) },
    { label: "Shape Product Concept", done: Boolean(status.hasBuildInputs) },
    { label: "Build Product Concept", done: Boolean(status.hasInvention) },
  ];
}

export function SPARKRail({
  flowMode,
  progressPercent,
  selectedPerspectives,
  insights,
  invention,
  flowStatus,
  perspectiveDraftActive = false,
  collapsed,
  onToggleCollapsed,
}: Props) {
  const [flowOpen, setFlowOpen] = useState(true);
  const [progressOpen, setProgressOpen] = useState(true);
  const [selectedOpen, setSelectedOpen] = useState(true);
  const [insightsOpen, setInsightsOpen] = useState(true);
  const [inventionOpen, setInventionOpen] = useState(true);

  if (collapsed) {
    return (
      <nav
        className="rounded-2xl border border-slate-300 bg-slate-100 p-2 shadow-card"
        aria-label="Workflow navigation"
      >
        <button
          type="button"
          onClick={onToggleCollapsed}
          className="mb-2 flex w-full items-center justify-center rounded-lg border border-slate-300 bg-slate-100 py-2 text-base font-bold text-slate-800 hover:bg-slate-200"
          title="Expand left rail"
          aria-label="Expand left rail"
        >
          »
        </button>
        <div className="px-1 text-center text-[10px] font-semibold uppercase tracking-wider text-slate-500">
          Flow
        </div>
      </nav>
    );
  }

  return (
    <nav
      className="rounded-2xl border border-slate-300 bg-slate-100 p-2.5 shadow-card"
      aria-label="Workflow navigation"
    >
      <button
        type="button"
        onClick={onToggleCollapsed}
        className="mb-3 flex w-full items-center justify-between rounded-xl border border-slate-300 bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-200"
        aria-label="Collapse left rail"
      >
        <span>Left navigation</span>
        <span aria-hidden>«</span>
      </button>

      <div className="mb-2 rounded-xl border border-indigo-200 bg-gradient-to-br from-indigo-50 to-white">
        {(() => {
          const steps = buildFlowSteps(flowMode, flowStatus);
          const nextIdx = steps.findIndex((step) => !step.done);
          const nextLabel = nextIdx >= 0 ? `${nextIdx + 1}. ${steps[nextIdx].label}` : "Complete";
          const flowTitle =
            flowMode === "studio"
              ? "Studio flow"
              : flowMode === "guided"
                ? "Guided flow"
                : "Quick flow";
          return (
            <>
              <button
                type="button"
                onClick={() => setFlowOpen((v) => !v)}
                className="flex w-full items-center justify-between bg-transparent px-3 py-2 text-left text-slate-800"
                aria-expanded={flowOpen}
              >
                <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-700">
                  {flowTitle}
                </span>
                <span className="text-xs font-semibold text-slate-700">
                  {flowOpen ? "Hide" : "Show"}
                </span>
              </button>
              {flowOpen ? (
                <div className="border-t border-indigo-100 px-2 py-2">
                  <div className="mb-2 inline-flex rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-semibold text-indigo-800">
                    {nextIdx >= 0 ? `Next up: ${nextLabel}` : "All steps complete"}
                  </div>
                  <ul className="flex flex-col gap-1">
                    {steps.map((step, idx) => (
                      <li key={`${step.label}-${idx}`}>
                        <div
                          className={`flex w-full items-center gap-2 rounded-xl bg-slate-100 px-2 py-2 text-left text-sm transition ${
                            idx === nextIdx
                              ? "ring-1 ring-indigo-300"
                              : step.done
                                ? "bg-emerald-50/60"
                                : "hover:bg-slate-200/80"
                          }`}
                        >
                          <span
                            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-bold !text-white ${
                              step.done ? "bg-emerald-500" : "bg-slate-400"
                            }`}
                          >
                            {idx + 1}
                          </span>
                          <span
                            className={`min-w-0 flex-1 font-semibold ${
                              idx === nextIdx
                                ? "text-indigo-800"
                                : step.done
                                  ? "text-slate-900"
                                  : "text-slate-700"
                            }`}
                          >
                            {step.label}
                          </span>
                          <span className={step.done ? "text-emerald-600" : "text-slate-400"}>
                            {step.done ? "✓" : "○"}
                          </span>
                        </div>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2 border-t border-slate-100 pt-2 text-[10px] leading-relaxed text-slate-500">
                    ✓ complete · ○ pending
                  </p>
                </div>
              ) : null}
            </>
          );
        })()}
      </div>

      <div className="mt-2 rounded-xl border border-slate-300 bg-slate-200/70">
        <button
          type="button"
          onClick={() => setProgressOpen((v) => !v)}
          className="flex w-full items-center justify-between bg-transparent px-3 py-2 text-left text-slate-800"
          aria-expanded={progressOpen}
        >
          <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-700">
            Creativity progress
          </span>
          <span className="text-xs font-semibold text-slate-700">
            {progressOpen ? "Hide" : "Show"}
          </span>
        </button>
        {progressOpen ? (
          <div className="border-t border-slate-200 px-3 py-2">
            <div className="h-2 overflow-hidden rounded-full bg-slate-200">
              <div
                className="h-full rounded-full bg-gradient-to-r from-spark-situation via-spark-pieces to-spark-actions transition-all duration-500"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <p className="mt-1 text-right text-xs text-slate-500">{progressPercent}%</p>
          </div>
        ) : null}
      </div>

      <div className="mt-2 rounded-xl border border-slate-300 bg-slate-200/70">
        <button
          type="button"
          onClick={() => setSelectedOpen((v) => !v)}
          className="flex w-full items-center justify-between bg-transparent px-3 py-2 text-left text-slate-800"
          aria-expanded={selectedOpen}
        >
          <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-700">
            Selected ideas
          </span>
          <span className="text-xs font-semibold text-slate-700">
            {selectedOpen ? "Hide" : "Show"}
          </span>
        </button>
        {selectedOpen ? (
          <div className="border-t border-slate-200 px-3 py-2">
            {perspectiveDraftActive ? (
              <p className="text-xs text-slate-700">
                Save your draft pool to view selected ideas here.
              </p>
            ) : selectedPerspectives.length === 0 ? (
              <p className="text-xs text-slate-600">No selected ideas yet.</p>
            ) : (
              <ul className="max-h-40 space-y-1.5 overflow-y-auto text-xs text-slate-800">
                {selectedPerspectives.slice(0, 8).map((p) => (
                  <li key={p.perspective_id} className="rounded-lg bg-blue-50 px-2 py-1.5">
                    {(p.text || p.description || "").slice(0, 120)}
                    {(p.text || p.description || "").length > 120 ? "…" : ""}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}
      </div>

      <div className="mt-2 rounded-xl border border-slate-300 bg-slate-200/70">
        <button
          type="button"
          onClick={() => setInsightsOpen((v) => !v)}
          className="flex w-full items-center justify-between bg-transparent px-3 py-2 text-left text-slate-800"
          aria-expanded={insightsOpen}
        >
          <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-700">
            Insights
          </span>
          <span className="text-xs font-semibold text-slate-700">
            {insightsOpen ? "Hide" : "Show"}
          </span>
        </button>
        {insightsOpen ? (
          <div className="border-t border-slate-200 px-3 py-2">
            {insights.length === 0 ? (
              <p className="text-xs text-slate-600">No insights yet.</p>
            ) : (
              <ul className="max-h-44 space-y-2 overflow-y-auto text-xs text-slate-800">
                {insights.slice(0, 6).map((ins) => (
                  <li key={ins.insight_id} className="rounded-lg border border-slate-200 bg-white px-2 py-1.5">
                    {ins.text}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}
      </div>

      <div className="mt-2 rounded-xl border border-slate-300 bg-slate-200/70">
        <button
          type="button"
          onClick={() => setInventionOpen((v) => !v)}
          className="flex w-full items-center justify-between bg-transparent px-3 py-2 text-left text-slate-800"
          aria-expanded={inventionOpen}
        >
          <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-700">
            Invention
          </span>
          <span className="text-xs font-semibold text-slate-700">
            {inventionOpen ? "Hide" : "Show"}
          </span>
        </button>
        {inventionOpen ? (
          <div className="border-t border-slate-200 px-3 py-2">
            {invention ? (
              <>
                <p className="text-sm font-semibold text-slate-900">{invention.title}</p>
                <p className="mt-1 text-xs text-slate-700">{invention.description}</p>
              </>
            ) : (
              <p className="text-xs text-slate-600">No invention yet.</p>
            )}
          </div>
        ) : null}
      </div>
    </nav>
  );
}
