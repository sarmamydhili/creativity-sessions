"use client";

import type { SessionDetail } from "@/lib/types";

type Props = {
  session: SessionDetail;
  loading: string | null;
  deliverableLabel?: string;
  onGenerate: () => void;
};

export function EnlightenmentView({
  session,
  loading,
  deliverableLabel = "concept",
  onGenerate,
}: Props) {
  const en = session.enlightenment;

  return (
    <section
      id="enlightenment-view"
      className="card stack rounded-2xl border border-slate-200 bg-white p-5 shadow-card"
    >
      <h2 className="text-lg font-semibold text-slate-900">What did we learn?</h2>
      <p className="muted text-sm text-slate-600">
        Extract reusable principles from this {deliverableLabel.toLowerCase()} so
        you can reuse them later.
      </p>
      <button
        type="button"
        className="w-full max-w-xs rounded-xl bg-spark-keygoal py-2.5 text-sm font-semibold text-white shadow-soft disabled:opacity-45 sm:w-auto sm:px-6"
        disabled={loading !== null}
        onClick={onGenerate}
      >
        {loading === "enl" ? "…" : "Save reusable lessons"}
      </button>
      {en ? (
        <div className="mt-4 space-y-4 rounded-xl border border-rose-100 bg-rose-50/40 p-4">
          <p className="text-sm font-medium leading-relaxed text-slate-900">
            {en.summary}
          </p>
          <ul className="list-disc space-y-2 pl-5 text-sm text-slate-800">
            {en.principles.map((x, i) => (
              <li key={i}>{x}</li>
            ))}
          </ul>
          <p className="text-xs text-slate-600">{en.applies_elsewhere}</p>
          <button
            type="button"
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
            onClick={() => {
              try {
                const blob = new Blob(
                  [en.summary, "\n\n", en.principles.join("\n"), "\n\n", en.applies_elsewhere],
                  { type: "text/plain" },
                );
                const a = document.createElement("a");
                a.href = URL.createObjectURL(blob);
                a.download = "spark-learning.txt";
                a.click();
                URL.revokeObjectURL(a.href);
              } catch {
                /* ignore */
              }
            }}
          >
            Save to file (library)
          </button>
        </div>
      ) : null}
    </section>
  );
}
