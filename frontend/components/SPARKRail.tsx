"use client";

import type { SparkRailKey, RailStatus } from "@/lib/spark-ui";

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
};

export function SPARKRail({ activeKey, onSelect, statusFor }: Props) {
  return (
    <nav
      className="rounded-2xl border border-slate-200 bg-white p-3 shadow-card"
      aria-label="SPARK dimensions"
    >
      <p className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
        SPARK map
      </p>
      <ul className="flex flex-col gap-1">
        {RAIL_META.map(({ key, label, letter, color }) => {
          const st = statusFor(key);
          const isActive = activeKey === key;
          return (
            <li key={key}>
              <button
                type="button"
                onClick={() => onSelect(key)}
                className={`flex w-full items-center gap-2 rounded-xl px-2 py-2.5 text-left text-sm transition ${
                  isActive
                    ? "bg-slate-100 ring-1 ring-slate-200"
                    : "hover:bg-slate-50"
                }`}
              >
                <span
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-bold text-white ${color}`}
                >
                  {letter}
                </span>
                <span className="min-w-0 flex-1 font-medium text-slate-800">
                  {label}
                </span>
                <StatusGlyph status={st} />
              </button>
            </li>
          );
        })}
      </ul>
      <p className="mt-3 border-t border-slate-100 pt-2 text-[10px] leading-relaxed text-slate-400">
        ✓ explored · ● active · ○ unexplored
      </p>
    </nav>
  );
}
