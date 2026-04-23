"use client";

import type { SessionDetail } from "@/lib/types";

type Props = {
  session: SessionDetail;
  loading: string | null;
  inventionLocked: boolean;
  deliverableLabel?: string;
  selectedFeatureCardsCount?: number;
  sectionTitle?: string;
  buildButtonLabel?: string;
  buildButtonId?: string;
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
  sectionTitle,
  buildButtonLabel,
  buildButtonId,
  inventionLockTitle,
  onGenerate,
}: Props) {
  const inv = session.invention;
  const count = session.inventions?.length ?? 0;
  const hasTemplateFields =
    Boolean(inv?.product_name) ||
    Boolean(inv?.what_is_it) ||
    Boolean(inv?.why_does_it_exist) ||
    Boolean(inv?.who_is_it_for);

  return (
    <section
      id="invention-builder"
      className="card stack rounded-2xl border border-slate-200 bg-white p-4 shadow-card"
    >
      <h2 className="text-lg font-semibold text-slate-900">
        {sectionTitle ?? `Shape your ${deliverableLabel.toLowerCase()}`}
      </h2>
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
        id={buildButtonId}
        type="button"
        className="w-full max-w-xs cursor-pointer rounded-xl bg-spark-role py-2.5 text-sm font-semibold text-white shadow-soft disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto sm:px-6"
        disabled={inventionLocked}
        title={
          inventionLocked
            ? (inventionLockTitle ??
              "Generate insights first, then return here to build a solution.")
            : "Propose one concrete direction from your selected insights."
        }
        onClick={onGenerate}
      >
        {loading === "inv" ? "…" : (buildButtonLabel ?? `Build ${deliverableLabel}`)}
      </button>
      {buildButtonLabel ? (
        <p className="text-xs font-medium text-indigo-700">
          Next: 9. Build Product Concept
        </p>
      ) : null}
      {inv ? (
        <div className="mt-3 space-y-2.5 rounded-xl border border-slate-100 bg-slate-50/50 p-3">
          <h3 className="text-base font-semibold text-slate-900">
            {inv.product_name || inv.title}
          </h3>
          {hasTemplateFields ? (
            <div className="space-y-2 text-xs text-slate-700">
              <p><strong>1. Product Name:</strong> {inv.product_name || inv.title}</p>
              <p><strong>2. What is it?</strong> {inv.what_is_it || inv.description}</p>
              <p><strong>3. Why does it exist?</strong> {inv.why_does_it_exist || "-"}</p>
              <p><strong>4. Who is it for?</strong> {inv.who_is_it_for || "-"}</p>
              <p><strong>5. What value does it provide?</strong> {inv.value_provided || inv.benefits || "-"}</p>
              <div>
                <p className="m-0"><strong>6. Core Capabilities</strong></p>
                <ul className="ml-4 list-disc">
                  {(inv.core_capabilities && inv.core_capabilities.length > 0
                    ? inv.core_capabilities
                    : ["-"]).map((cap, idx) => (
                    <li key={`${cap}-${idx}`}>{cap}</li>
                  ))}
                </ul>
              </div>
              <p><strong>7. How is it different?</strong> {inv.how_is_it_different || "-"}</p>
              <p><strong>8. Business Goal:</strong> {inv.business_goal || "-"}</p>
              <p><strong>9. Success Looks Like:</strong> {inv.success_looks_like || "-"}</p>
              <p><strong>10. Future Potential:</strong> {inv.future_potential || inv.next_steps || "-"}</p>
            </div>
          ) : (
            <>
              <p className="text-sm text-slate-800">{inv.description}</p>
              <p className="text-xs text-slate-600">{inv.benefits}</p>
              <p className="text-xs text-slate-600">{inv.next_steps}</p>
            </>
          )}
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
