"use client";

import type { CreativeLevers } from "@/lib/types";
import {
  ABSTRACTION_OPTIONS,
  COGNITIVE_TOOL_OPTIONS,
  DEPTH_OPTIONS,
  DIVERGENCE_OPTIONS,
  DOMAIN_LENS_OPTIONS,
  GOAL_PRIORITY_OPTIONS,
  NOVELTY_OPTIONS,
  SPARK_TARGET_OPTIONS,
} from "@/lib/types";

type Props = {
  value: CreativeLevers;
  onChange: (next: CreativeLevers) => void;
  disabled?: boolean;
};

function Field({
  label,
  accentClass,
  children,
}: {
  label: string;
  accentClass?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label
        className={`text-[11px] font-semibold uppercase tracking-wide text-slate-500 ${accentClass ?? ""}`}
      >
        {label}
      </label>
      {children}
    </div>
  );
}

const selectClass =
  "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-500/20 disabled:opacity-50";

export function CreativeLeverPanel({ value, onChange, disabled }: Props) {
  function patch<K extends keyof CreativeLevers>(key: K, v: CreativeLevers[K]) {
    onChange({ ...value, [key]: v });
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-white to-slate-50/90 p-4 shadow-card ring-1 ring-slate-100">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">
            Creative lever control
          </h3>
          <p className="mt-1 text-xs leading-relaxed text-slate-600">
            Tune how GenAI reframes your SPARK target — depth, divergence,
            abstraction, domain lens, goal priority, and novelty.
          </p>
        </div>
        <span
          className="hidden shrink-0 rounded-lg bg-spark-situation/10 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-spark-situation sm:inline"
          aria-hidden
        >
          GenAI
        </span>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="SPARK target" accentClass="text-spark-situation">
          <select
            className={selectClass}
            disabled={disabled}
            value={value.spark_target}
            onChange={(e) =>
              patch("spark_target", e.target.value as CreativeLevers["spark_target"])
            }
          >
            {SPARK_TARGET_OPTIONS.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Cognitive tool" accentClass="text-spark-pieces">
          <select
            className={selectClass}
            disabled={disabled}
            value={value.tool}
            onChange={(e) =>
              patch("tool", e.target.value as CreativeLevers["tool"])
            }
          >
            {COGNITIVE_TOOL_OPTIONS.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Depth">
          <select
            className={selectClass}
            disabled={disabled}
            value={value.depth}
            onChange={(e) =>
              patch("depth", e.target.value as CreativeLevers["depth"])
            }
          >
            {DEPTH_OPTIONS.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Divergence (count)">
          <select
            className={selectClass}
            disabled={disabled}
            value={value.divergence}
            onChange={(e) =>
              patch("divergence", e.target.value as CreativeLevers["divergence"])
            }
          >
            {DIVERGENCE_OPTIONS.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Abstraction">
          <select
            className={selectClass}
            disabled={disabled}
            value={value.abstraction}
            onChange={(e) =>
              patch("abstraction", e.target.value as CreativeLevers["abstraction"])
            }
          >
            {ABSTRACTION_OPTIONS.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Domain lens" accentClass="text-spark-actions">
          <select
            className={selectClass}
            disabled={disabled}
            value={value.domain_lens}
            onChange={(e) =>
              patch("domain_lens", e.target.value as CreativeLevers["domain_lens"])
            }
          >
            {DOMAIN_LENS_OPTIONS.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Goal priority" accentClass="text-spark-role">
          <select
            className={selectClass}
            disabled={disabled}
            value={value.goal_priority}
            onChange={(e) =>
              patch(
                "goal_priority",
                e.target.value as CreativeLevers["goal_priority"],
              )
            }
          >
            {GOAL_PRIORITY_OPTIONS.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Novelty" accentClass="text-spark-keygoal">
          <select
            className={selectClass}
            disabled={disabled}
            value={value.novelty}
            onChange={(e) =>
              patch("novelty", e.target.value as CreativeLevers["novelty"])
            }
          >
            {NOVELTY_OPTIONS.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </Field>
      </div>
    </div>
  );
}
