"use client";

import type { Perspective } from "@/lib/types";

const TOOL_LABELS: Record<string, string> = {
  analogy: "Analogy",
  recategorization: "Reframe",
  combination: "Combine",
  association: "Association",
  user: "Your idea",
};

export type PerspectiveCardsProps = {
  perspectives: Perspective[];
  loading: string | null;
  compareMode?: boolean;
  onPatchLocal: (perspectiveId: string, patch: Partial<Perspective>) => void;
  onToggleField: (
    p: Perspective,
    field: "selected" | "promising",
    value: boolean,
  ) => void;
  onSaveText: (perspectiveId: string) => void;
  onRemove: (p: Perspective) => void;
};

export function PerspectiveCards({
  perspectives,
  loading,
  compareMode = false,
  onPatchLocal,
  onToggleField,
  onSaveText,
  onRemove,
}: PerspectiveCardsProps) {
  if (perspectives.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50/80 px-4 py-8 text-center text-sm text-slate-500">
        No perspective cards yet. Generate with creative levers or the classic
        matrix, or add your own card.
      </p>
    );
  }

  return (
    <div
      className={
        compareMode
          ? "grid gap-4 md:grid-cols-2"
          : "flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2 md:snap-none md:flex-col md:overflow-visible md:pb-0 [-webkit-overflow-scrolling:touch]"
      }
    >
      {perspectives.map((p, idx) => (
        <article
          key={p.perspective_id}
          className="perspective-card flex min-w-[min(100%,22rem)] shrink-0 snap-center flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-card max-md:snap-center md:min-w-0 md:w-full md:shrink md:snap-none"
        >
          <div className="perspective-card-top flex flex-wrap items-center gap-2">
            <span className="perspective-badge rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-spark-situation">
              Idea {idx + 1}
            </span>
            <span className="perspective-badge subtle rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
              {TOOL_LABELS[p.source_tool] ?? p.source_tool}
            </span>
          </div>
          <div className="perspective-card-body flex min-w-0 flex-col gap-2">
            <label
              className="label text-xs text-slate-500"
              htmlFor={`pt-${p.perspective_id}`}
            >
              What could this mean for your problem?
            </label>
            <textarea
              id={`pt-${p.perspective_id}`}
              rows={4}
              className="perspective-body-input min-h-[6.5rem] w-full resize-y rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400"
              value={p.text || p.description || ""}
              onChange={(e) =>
                onPatchLocal(p.perspective_id, {
                  text: e.target.value,
                  description: e.target.value,
                })
              }
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
          <div className="perspective-card-controls flex flex-col gap-3 border-t border-slate-100 pt-3 text-sm">
            <label className="perspective-check flex cursor-pointer gap-2">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={p.selected}
                disabled={loading !== null}
                onChange={(e) =>
                  void onToggleField(p, "selected", e.target.checked)
                }
              />
              <span className="text-slate-700">Use when generating insights</span>
            </label>
            <label className="perspective-check flex cursor-pointer gap-2">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={p.promising ?? false}
                disabled={loading !== null}
                onChange={(e) =>
                  void onToggleField(p, "promising", e.target.checked)
                }
              />
              <span className="text-slate-700">Promising</span>
            </label>
          </div>
          <div className="perspective-card-actions flex flex-wrap gap-2 border-t border-slate-100 pt-2">
            <button
              type="button"
              className="rounded-xl bg-spark-situation px-3 py-2 text-sm font-medium text-white disabled:opacity-45"
              disabled={loading !== null}
              onClick={() => void onSaveText(p.perspective_id)}
            >
              Save text
            </button>
            <button
              type="button"
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-red-600 hover:bg-red-50"
              disabled={loading !== null}
              onClick={() => void onRemove(p)}
            >
              Delete
            </button>
          </div>
        </article>
      ))}
    </div>
  );
}
