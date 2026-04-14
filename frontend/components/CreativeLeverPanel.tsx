"use client";

import type { PerspectivePoolSettings } from "@/lib/types";
import {
  BOLDNESS_TIER_OPTIONS,
  GOAL_PRIORITY_POOL_OPTIONS,
  NOVELTY_TIER_OPTIONS,
} from "@/lib/types";

type Props = {
  value: PerspectivePoolSettings;
  onChange: (next: PerspectivePoolSettings) => void;
  disabled?: boolean;
};

function SectionTitle({
  title,
  hint,
}: {
  title: string;
  hint?: string;
}) {
  return (
    <div className="mb-2">
      <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
        {title}
      </h4>
      {hint ? (
        <p className="mt-0.5 text-[10px] leading-relaxed text-slate-400">{hint}</p>
      ) : null}
    </div>
  );
}

const tierLabel = (t: string) =>
  t === "low" ? "Low" : t === "high" ? "High" : "Medium";

/** 3-stop fader for low / medium / high */
function TierFader({
  label,
  hint,
  options,
  value,
  onChange,
  disabled,
  accent,
}: {
  label: string;
  hint?: string;
  options: readonly string[];
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  accent: "indigo" | "rose";
}) {
  const idx = Math.max(0, options.indexOf(value));
  const thumbPaint =
    accent === "indigo"
      ? "[&::-webkit-slider-thumb]:bg-indigo-600 [&::-moz-range-thumb]:bg-indigo-600 [&::-webkit-slider-thumb]:shadow-indigo-900/35 [&::-moz-range-thumb]:shadow-indigo-900/35 [&::-webkit-slider-thumb]:ring-indigo-300 [&::-moz-range-thumb]:ring-indigo-300"
      : "[&::-webkit-slider-thumb]:bg-rose-500 [&::-moz-range-thumb]:bg-rose-500 [&::-webkit-slider-thumb]:shadow-rose-900/30 [&::-moz-range-thumb]:shadow-rose-900/30 [&::-webkit-slider-thumb]:ring-rose-300 [&::-moz-range-thumb]:ring-rose-300";
  const chipActive =
    accent === "indigo"
      ? "bg-white text-slate-900 shadow-sm ring-2 ring-indigo-400/50"
      : "bg-white text-slate-900 shadow-sm ring-2 ring-rose-400/50";
  const trackBg =
    accent === "indigo"
      ? "bg-gradient-to-r from-slate-300 via-indigo-400 to-indigo-600"
      : "bg-gradient-to-r from-rose-400 via-fuchsia-500 to-pink-600";

  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-3">
      <SectionTitle title={label} hint={hint} />
      <div className="relative">
        <div
          className={`pointer-events-none absolute left-0 right-0 top-[10px] h-2.5 rounded-full ${trackBg} opacity-95 ring-1 ring-black/10`}
          aria-hidden
        />
        <input
          type="range"
          min={0}
          max={options.length - 1}
          step={1}
          value={idx}
          disabled={disabled}
          aria-label={label}
          onChange={(e) => {
            const i = Number(e.target.value);
            onChange(options[i]!);
          }}
          className={`relative z-10 h-9 w-full cursor-pointer appearance-none bg-transparent outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-45 [&::-webkit-slider-runnable-track]:h-2.5 [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-runnable-track]:bg-transparent [&::-webkit-slider-thumb]:mt-[-8px] [&::-webkit-slider-thumb]:h-6 [&::-webkit-slider-thumb]:w-6 [&::-webkit-slider-thumb]:cursor-grab [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-[3px] [&::-webkit-slider-thumb]:border-white [&::-webkit-slider-thumb]:shadow-lg active:[&::-webkit-slider-thumb]:cursor-grabbing [&::-webkit-slider-thumb]:ring-2 [&::-moz-range-thumb]:ring-2 ${thumbPaint} [&::-moz-range-track]:h-2.5 [&::-moz-range-track]:rounded-full [&::-moz-range-track]:bg-transparent [&::-moz-range-thumb]:h-6 [&::-moz-range-thumb]:w-6 [&::-moz-range-thumb]:cursor-grab [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-[3px] [&::-moz-range-thumb]:border-white [&::-moz-range-thumb]:shadow-lg`}
        />
        <div className="mt-2 flex justify-between gap-1 text-center">
          {options.map((o) => (
            <button
              key={o}
              type="button"
              disabled={disabled}
              onClick={() => onChange(o)}
              className={`min-w-0 flex-1 rounded-lg px-1 py-1.5 text-[10px] font-medium leading-tight transition sm:text-[11px] ${
                value === o ? chipActive : "text-slate-500 hover:bg-white/60 hover:text-slate-800"
              }`}
            >
              {tierLabel(o)}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * Three global controls only: Boldness, Novelty, Goal priority.
 * The backend runs all four cognitive tools in one GenAI call.
 */
export function CreativeLeverPanel({ value, onChange, disabled }: Props) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-gradient-to-b from-white via-slate-50/30 to-slate-100/40 p-4 shadow-card ring-1 ring-slate-100">
      <div className="mb-4 flex items-start justify-between gap-2 border-b border-slate-100 pb-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">
            Perspective controls
          </h3>
          <p className="mt-1 text-xs leading-relaxed text-slate-600">
            One generation uses <strong>analogy, re-categorization, combination, and association</strong>{" "}
            together — you only tune boldness, novelty, and goal priority.
          </p>
        </div>
        <span
          className="hidden shrink-0 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 px-2 py-1.5 text-[10px] font-bold uppercase tracking-wider text-white shadow-sm sm:inline"
          aria-hidden
        >
          Pool
        </span>
      </div>

      <div className="flex flex-col gap-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <TierFader
            label="Boldness"
            hint="Safe and incremental → bold and transformative"
            options={BOLDNESS_TIER_OPTIONS}
            value={value.boldness}
            onChange={(boldness) => onChange({ ...value, boldness: boldness as PerspectivePoolSettings["boldness"] })}
            disabled={disabled}
            accent="indigo"
          />
          <TierFader
            label="Novelty"
            hint="Familiar → surprising"
            options={NOVELTY_TIER_OPTIONS}
            value={value.novelty}
            onChange={(novelty) => onChange({ ...value, novelty: novelty as PerspectivePoolSettings["novelty"] })}
            disabled={disabled}
            accent="rose"
          />
        </div>

        <div>
          <SectionTitle
            title="Goal priority"
            hint="What should perspectives optimize for?"
          />
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {GOAL_PRIORITY_POOL_OPTIONS.map(({ value: v, label }) => (
              <button
                key={v}
                type="button"
                disabled={disabled}
                onClick={() => onChange({ ...value, goal_priority: v })}
                className={`rounded-xl border px-2 py-2.5 text-center text-[11px] font-semibold leading-snug transition sm:text-xs ${
                  value.goal_priority === v
                    ? "border-purple-400 bg-purple-50 text-purple-950 shadow-sm ring-1 ring-purple-200"
                    : "border-slate-200 bg-white text-slate-600 hover:border-purple-200 hover:bg-purple-50/40"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
