"use client";

import type { SessionDetail } from "@/lib/types";

type Props = {
  session: SessionDetail;
  loading: string | null;
  inventionLocked: boolean;
  /** Shown as native tooltip when the button is disabled (why it won’t run). */
  inventionLockTitle?: string;
  onGenerate: () => void;
};

export function InventionBuilder({
  session,
  loading,
  inventionLocked,
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
      <h2 className="text-lg font-semibold text-slate-900">Invention builder</h2>
      <p className="muted text-sm text-slate-600">
        Merge ideas into a concrete invention concept. Run after you have
        generated insights.
      </p>
      <button
        type="button"
        className="w-full max-w-xs cursor-pointer rounded-xl bg-spark-role py-2.5 text-sm font-semibold text-white shadow-soft disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto sm:px-6"
        disabled={inventionLocked}
        title={
          inventionLocked
            ? (inventionLockTitle ??
              "Generate insights first, then return here to build a solution.")
            : "Propose one invention concept from your insights."
        }
        onClick={onGenerate}
      >
        {loading === "inv" ? "…" : "Build solution"}
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
          {count} invention(s) recorded (latest summarized above).
        </p>
      ) : null}
    </section>
  );
}
