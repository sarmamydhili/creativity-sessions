"use client";

import { useState } from "react";
import type { SparkRailKey, RailStatus } from "@/lib/spark-ui";
import type { InsightRecord, InventionArtifact, Perspective } from "@/lib/types";

const RAIL_META: {
  key: SparkRailKey;
  label: string;
  letter: string;
  color: string;
}[] = [
  { key: "situation", label: "Situation", letter: "S", color: "bg-spark-situation" },
  { key: "parts", label: "Pieces", letter: "P", color: "bg-spark-pieces" },
  { key: "actions", label: "Actions", letter: "A", color: "bg-spark-actions" },
  { key: "role", label: "Role", letter: "R", color: "bg-spark-role" },
  { key: "key_goal", label: "Key goal", letter: "K", color: "bg-spark-keygoal" },
];

function StatusGlyph({ status }: { status: RailStatus }) {
  if (status === "explored") {
    return (
      <span className="text-emerald-600" title="Explored" aria-label="Explored">
        ✓
      </span>
    );
  }
  if (status === "active") {
    return (
      <span className="text-spark-situation" title="Active" aria-label="Active">
        ●
      </span>
    );
  }
  return (
    <span className="text-slate-300" title="Unexplored" aria-label="Unexplored">
      ○
    </span>
  );
}

type Props = {
  activeKey: SparkRailKey;
  onSelect: (key: SparkRailKey) => void;
  statusFor: (key: SparkRailKey) => RailStatus;
  progressPercent: number;
  selectedPerspectives: Perspective[];
  insights: InsightRecord[];
  invention: InventionArtifact | null;
  perspectiveDraftActive?: boolean;
  collapsed: boolean;
  onToggleCollapsed: () => void;
};

export function SPARKRail({
  activeKey,
  onSelect,
  statusFor,
  progressPercent,
  selectedPerspectives,
  insights,
  invention,
  perspectiveDraftActive = false,
  collapsed,
  onToggleCollapsed,
}: Props) {
  const [sparkMapOpen, setSparkMapOpen] = useState(true);
  const [progressOpen, setProgressOpen] = useState(true);
  const [selectedOpen, setSelectedOpen] = useState(true);
  const [insightsOpen, setInsightsOpen] = useState(true);
  const [inventionOpen, setInventionOpen] = useState(true);

  if (collapsed) {
    return (
      <nav
        className="rounded-2xl border border-slate-300 bg-slate-100 p-2 shadow-card"
        aria-label="SPARK dimensions"
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
        <div className="space-y-1">
          {RAIL_META.map(({ key, letter, color }) => {
            const isActive = activeKey === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => onSelect(key)}
                className={`flex h-9 w-9 items-center justify-center rounded-lg text-xs font-bold !text-white ring-1 ring-slate-200 ${
                  isActive ? "opacity-100" : "opacity-75 hover:opacity-100"
                } ${color}`}
                title={key}
                aria-label={key}
              >
                {letter}
              </button>
            );
          })}
        </div>
      </nav>
    );
  }

  return (
    <nav
      className="rounded-2xl border border-slate-300 bg-slate-100 p-3 shadow-card"
      aria-label="SPARK dimensions"
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

      <div className="rounded-xl border border-slate-300 bg-slate-200/70">
        <button
          type="button"
          onClick={() => setSparkMapOpen((v) => !v)}
          className="flex w-full items-center justify-between bg-transparent px-3 py-2 text-left text-slate-800"
          aria-expanded={sparkMapOpen}
        >
          <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-700">
            SPARK map
          </span>
          <span className="text-xs font-semibold text-slate-700">
            {sparkMapOpen ? "Hide" : "Show"}
          </span>
        </button>
        {sparkMapOpen ? (
          <div className="border-t border-slate-200 px-2 py-2">
            <ul className="flex flex-col gap-1">
              {RAIL_META.map(({ key, label, letter, color }) => {
                const st = statusFor(key);
                const isActive = activeKey === key;
                return (
                  <li key={key}>
                    <button
                      type="button"
                      onClick={() => onSelect(key)}
                      className={`flex w-full items-center gap-2 rounded-xl bg-slate-100 px-2 py-2.5 text-left text-sm transition ${
                        isActive
                          ? "bg-slate-200 ring-1 ring-slate-300"
                          : "hover:bg-slate-200/80"
                      }`}
                    >
                      <span
                        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-bold !text-white ${color}`}
                      >
                        {letter}
                      </span>
                      <span className="min-w-0 flex-1 font-semibold text-slate-900">
                        {label}
                      </span>
                      <StatusGlyph status={st} />
                    </button>
                  </li>
                );
              })}
            </ul>
            <p className="mt-2 border-t border-slate-100 pt-2 text-[10px] leading-relaxed text-slate-400">
              ✓ explored · ● active · ○ unexplored
            </p>
          </div>
        ) : null}
      </div>

      <div className="mt-3 rounded-xl border border-slate-300 bg-slate-200/70">
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

      <div className="mt-3 rounded-xl border border-slate-300 bg-slate-200/70">
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

      <div className="mt-3 rounded-xl border border-slate-300 bg-slate-200/70">
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

      <div className="mt-3 rounded-xl border border-slate-300 bg-slate-200/70">
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
