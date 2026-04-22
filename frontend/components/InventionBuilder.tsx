"use client";

import type { SessionDetail } from "@/lib/types";

type Props = {
  session: SessionDetail;
  loading: string | null;
  inventionLocked: boolean;
  deliverableLabel?: string;
  selectedFeatureCardsCount?: number;
  /** Shown as native tooltip when the button is disabled (why it won’t run). */
  inventionLockTitle?: string;
  onGenerate: () => void;
};

export function InventionBuilder({
  session,
  loading,
  inventionLocked,
  deliverableLabel = "Concept plan",
  selectedFeatureCardsCount = 0,
  inventionLockTitle,
  onGenerate,
}: Props) {
  const inv = session.invention;
  const count = session.inventions?.length ?? 0;

  return (
    <section
      id="invention-builder"
      className="card stack rounded-2xl border border-slate-200 bg-white p-5 shadow-card"
    >
      <h2 className="text-lg font-semibold text-slate-900">Shape your {deliverableLabel.toLowerCase()}</h2>
      <p className="muted text-sm text-slate-600">
        Merge your selected context into a concrete direction. You can build from
        insights and/or selected stakeholder feature cards.
      </p>
      {selectedFeatureCardsCount > 0 ? (
        <p className="text-xs text-slate-500">
          {selectedFeatureCardsCount} stakeholder feature card
          {selectedFeatureCardsCount === 1 ? "" : "s"} selected for build context.
        </p>
      ) : null}
      <button
        type="button"
        className="w-full max-w-xs cursor-pointer rounded-xl bg-spark-role py-2.5 text-sm font-semibold text-white shadow-soft disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto sm:px-6"
        disabled={inventionLocked}
        title={
          inventionLocked
            ? (inventionLockTitle ??
              "Generate insights first, then return here to build a solution.")
            : "Propose one concrete direction from your selected patterns."
        }
        onClick={onGenerate}
      >
        {loading === "inv" ? "…" : `Build ${deliverableLabel}`}
      </button>
      {inv ? (
        <div className="mt-4 space-y-3 rounded-xl border border-slate-100 bg-slate-50/50 p-4">
          <h3 className="text-base font-semibold text-slate-900">{inv.title}</h3>
          <p className="text-sm text-slate-800">{inv.description}</p>
          <p className="text-xs text-slate-600">{inv.benefits}</p>
          <p className="text-xs text-slate-600">{inv.next_steps}</p>
          <p className="text-xs text-slate-400">
            Editable copies can be pasted into your own docs — server persistence
            of edits may follow in a later release.
          </p>
        </div>
      ) : null}
      {count > 1 ? (
        <p className="text-xs text-slate-500">
          {count} saved versions recorded (latest summarized above).
        </p>
      ) : null}
    </section>
  );
}
