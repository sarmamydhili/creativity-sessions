"use client";

import { useEffect, useState } from "react";
import type { Perspective } from "@/lib/types";

const TOOL_LABELS: Record<string, string> = {
  analogy: "Analogy",
  recategorization: "Reframe",
  combination: "Combine",
  association: "Association",
  user: "Your idea",
};

function subtypeLabel(raw: string | null | undefined): string {
  if (!raw) return "";
  return raw
    .split("_")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

function parseRankScore(
  value: number | string | null | undefined,
): number | null {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : Number.parseFloat(String(value));
  if (Number.isNaN(n)) return null;
  return Math.max(0, Math.min(1, n));
}

function rankPercentLabel(score: number): string {
  return `${Math.round(score * 100)}%`;
}

/** Five stars with partial fills; hover shows exact % via native `title`. */
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

export type PerspectiveToggleField = "selected" | "promising" | "pool_excluded";

export type PerspectiveCardsProps = {
  perspectives: Perspective[];
  loading: string | null;
  compareMode?: boolean;
  /** When true, edits and toggles stay client-side (no Save to server). */
  localMode?: boolean;
  onPatchLocal: (perspectiveId: string, patch: Partial<Perspective>) => void;
  onToggleField: (p: Perspective, field: PerspectiveToggleField, value: boolean) => void;
  onSaveText: (perspectiveId: string) => void;
  onRemove: (p: Perspective) => void;
};

function autosizeTextarea(el: HTMLTextAreaElement, minHeightPx: number): void {
  el.style.height = "0px";
  const next = Math.max(el.scrollHeight, minHeightPx);
  el.style.height = `${next}px`;
}

export function PerspectiveCards({
  perspectives,
  loading,
  compareMode = false,
  localMode = false,
  onPatchLocal,
  onToggleField,
  onSaveText,
  onRemove,
}: PerspectiveCardsProps) {
  const [maximizedCardId, setMaximizedCardId] = useState<string | null>(null);

  useEffect(() => {
    if (!maximizedCardId) return;
    if (!perspectives.some((p) => p.perspective_id === maximizedCardId)) {
      setMaximizedCardId(null);
    }
  }, [maximizedCardId, perspectives]);

  if (perspectives.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50/80 px-4 py-8 text-center text-sm text-slate-500">
        No perspectives in this view. Generate a batch or widen your filters.
      </p>
    );
  }

  return (
    <div
      className={
        compareMode
          ? "grid gap-4 md:grid-cols-2"
          : "flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2 md:grid md:grid-cols-1 md:gap-4 md:overflow-visible md:pb-0 [-webkit-overflow-scrolling:touch] lg:grid-cols-2 2xl:grid-cols-2"
      }
    >
      {perspectives.map((p, idx) => {
        const rank = parseRankScore(p.rank_score);
        const excluded = Boolean(p.pool_excluded);
        const promising = Boolean(p.promising);
        const busy = loading !== null;
        const isMaximized = maximizedCardId === p.perspective_id;

        const shell =
          "perspective-card relative flex shrink-0 snap-center flex-col gap-3 rounded-2xl border p-4 pt-3 shadow-card max-md:snap-center md:min-w-0 md:w-full md:shrink md:snap-none transition-all " +
          (isMaximized
            ? "min-w-full md:col-span-2 md:row-span-1 md:self-stretch"
            : "min-w-[min(100%,26rem)]") +
          " " +
          (excluded
            ? "border-dashed border-slate-400/80 bg-slate-200/50 text-slate-600"
            : promising
              ? "border-amber-200 bg-amber-50/50 ring-2 ring-amber-300/50"
              : "border-slate-200 bg-white");

        return (
          <article key={p.perspective_id} className={shell}>
            <div className="absolute right-2 top-2 z-10 flex flex-col items-center gap-0.5">
              <button
                type="button"
                disabled={busy || excluded}
                aria-pressed={promising}
                aria-label={promising ? "Clear promising" : "Mark as promising"}
                title={
                  excluded
                    ? "Include in pool again to mark promising"
                    : promising
                      ? "Promising — click to clear"
                      : "Mark as promising"
                }
                className={
                  "flex h-9 w-9 items-center justify-center rounded-lg text-lg leading-none transition " +
                  (excluded
                    ? "cursor-not-allowed text-slate-300"
                    : promising
                      ? "bg-amber-100 text-amber-600 shadow-sm hover:bg-amber-200"
                      : "text-slate-300 hover:bg-amber-50/80 hover:text-amber-400")
                }
                onClick={() =>
                  void onToggleField(p, "promising", !promising)
                }
              >
                ★
              </button>
              <button
                type="button"
                disabled={busy}
                aria-pressed={excluded}
                aria-label={
                  excluded ? "Include in pool" : "Set aside — not in pool"
                }
                title={
                  excluded
                    ? "Include in pool again"
                    : "Not in pool — set aside (click + to bring back later)"
                }
                className={
                  "flex h-9 w-9 items-center justify-center rounded-lg text-base font-semibold leading-none transition " +
                  (excluded
                    ? "border border-emerald-500/60 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                    : "border border-slate-200 bg-white text-slate-500 hover:border-red-200 hover:bg-red-50 hover:text-red-600")
                }
                onClick={() =>
                  void onToggleField(p, "pool_excluded", !excluded)
                }
              >
                {excluded ? "+" : "×"}
              </button>
              <button
                type="button"
                disabled={busy}
                aria-pressed={isMaximized}
                aria-label={isMaximized ? "Minimize card" : "Maximize card"}
                title={isMaximized ? "Minimize card" : "Maximize card"}
                className={
                  "flex h-9 w-9 items-center justify-center rounded-lg border text-base font-semibold leading-none transition " +
                  (isMaximized
                    ? "border-indigo-300 bg-indigo-50 text-indigo-700 hover:bg-indigo-100"
                    : "border-slate-200 bg-white text-slate-500 hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700")
                }
                onClick={() =>
                  setMaximizedCardId((cur) =>
                    cur === p.perspective_id ? null : p.perspective_id,
                  )
                }
              >
                {isMaximized ? "−" : "⤢"}
              </button>
            </div>

            {excluded ? (
              <p className="m-0 pr-11 text-[11px] font-medium uppercase tracking-wide text-slate-500">
                Not in pool
              </p>
            ) : null}

            <div className="perspective-card-top flex flex-wrap items-center gap-2 pr-10">
              <span className="perspective-badge rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-spark-situation">
                Idea {idx + 1}
              </span>
              {rank != null ? (
                <span className="perspective-badge subtle inline-flex items-center rounded-full border border-emerald-100 bg-emerald-50/90 px-2 py-0.5 text-xs font-medium text-emerald-900">
                  <RankStars score={rank} />
                </span>
              ) : null}
            </div>
            <div className="perspective-card-body flex min-w-0 flex-col gap-2">
              {p.title ? (
                <p
                  className={
                    "text-sm font-semibold " +
                    (excluded ? "text-slate-600" : "text-slate-900")
                  }
                >
                  {p.title}
                </p>
              ) : null}
              <label
                className="label text-xs text-slate-500"
                htmlFor={`pt-${p.perspective_id}`}
              >
                What could this mean for your problem?
              </label>
              <textarea
                id={`pt-${p.perspective_id}`}
                rows={isMaximized ? 8 : 4}
                className={
                  "perspective-body-input w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 disabled:opacity-60 " +
                  (isMaximized ? "min-h-[11rem]" : "min-h-[6.5rem]")
                }
                disabled={busy}
                value={p.text || p.description || ""}
                ref={(el) => {
                  if (!el) return;
                  autosizeTextarea(el, isMaximized ? 176 : 104);
                }}
                onChange={(e) => {
                  autosizeTextarea(e.currentTarget, isMaximized ? 176 : 104);
                  onPatchLocal(p.perspective_id, {
                    text: e.target.value,
                    description: e.target.value,
                  })
                }}
                placeholder="Write a short angle or reframing…"
              />
            </div>
            {(p.part_ref || p.action_ref) && p.source_tool !== "user" ? (
              <div
                className="perspective-chips flex flex-col gap-2"
                aria-label="Source references"
              >
                {p.part_ref ? (
                  <span className="chip inline-block max-w-full rounded-lg bg-slate-100 px-2 py-1 text-xs text-slate-600 break-words">
                    <strong className="text-slate-800">Piece:</strong> {p.part_ref}
                  </span>
                ) : null}
                {p.action_ref ? (
                  <span className="chip inline-block max-w-full rounded-lg bg-slate-100 px-2 py-1 text-xs text-slate-600 break-words">
                    <strong className="text-slate-800">Action:</strong>{" "}
                    {p.action_ref}
                  </span>
                ) : null}
              </div>
            ) : null}
            <div className="perspective-card-tags mt-1 flex flex-wrap items-center gap-2">
              <span className="perspective-badge subtle rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
                {TOOL_LABELS[p.source_tool] ?? p.source_tool}
              </span>
              {p.subtype ? (
                <span
                  className="perspective-badge subtle rounded-full border border-slate-200 bg-white px-2.5 py-0.5 text-xs font-medium text-slate-600"
                  title="Cognitive subtype"
                >
                  {subtypeLabel(p.subtype)}
                </span>
              ) : null}
            </div>
            <div className="perspective-card-controls flex flex-col gap-3 border-t border-slate-100 pt-3 text-sm">
              <label className="perspective-check flex cursor-pointer gap-2">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={p.selected}
                  disabled={busy || excluded}
                  onChange={(e) =>
                    void onToggleField(p, "selected", e.target.checked)
                  }
                />
                <span className={excluded ? "text-slate-500" : "text-slate-700"}>
                  {localMode
                    ? "Use for insights after you save this pool"
                    : "Use when generating insights"}
                </span>
              </label>
            </div>
            {!localMode ? (
              <div className="perspective-card-actions flex flex-wrap gap-2 border-t border-slate-100 pt-2">
                <button
                  type="button"
                  className="rounded-xl bg-spark-situation px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 hover:text-white disabled:opacity-45"
                  disabled={busy}
                  onClick={() => void onSaveText(p.perspective_id)}
                >
                  Save text
                </button>
                <button
                  type="button"
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-red-700 shadow-sm hover:border-red-200 hover:bg-red-50 hover:text-red-800"
                  disabled={busy}
                  onClick={() => void onRemove(p)}
                >
                  Delete
                </button>
              </div>
            ) : null}
          </article>
        );
      })}
    </div>
  );
}
