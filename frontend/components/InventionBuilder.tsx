"use client";

import { useState } from "react";
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

type ParsedConceptSections = {
  what_is_it?: string;
  why_does_it_exist?: string;
  who_is_it_for?: string;
  value_provided?: string;
  how_is_it_different?: string;
  business_goal?: string;
  success_looks_like?: string;
  future_potential?: string;
};

function parseLabeledConceptText(text: string): ParsedConceptSections {
  const source = (text || "").trim();
  if (!source) return {};
  const markerRegex =
    /(what is it\?|why does it exist\?|who is it for\?|what value does it provide\?|how is it different\?|business goal:?|success looks like:?|future potential:?)/gi;
  const matches = [...source.matchAll(markerRegex)];
  if (matches.length < 2) return {};
  const out: ParsedConceptSections = {};
  for (let i = 0; i < matches.length; i += 1) {
    const marker = (matches[i][0] || "").toLowerCase().replace(/[:?]/g, "").trim();
    const start = (matches[i].index ?? 0) + matches[i][0].length;
    const end = i + 1 < matches.length ? (matches[i + 1].index ?? source.length) : source.length;
    const value = source.slice(start, end).trim().replace(/^[:\-\s]+/, "");
    if (!value) continue;
    if (marker === "what is it") out.what_is_it = value;
    else if (marker === "why does it exist") out.why_does_it_exist = value;
    else if (marker === "who is it for") out.who_is_it_for = value;
    else if (marker === "what value does it provide") out.value_provided = value;
    else if (marker === "how is it different") out.how_is_it_different = value;
    else if (marker === "business goal") out.business_goal = value;
    else if (marker === "success looks like") out.success_looks_like = value;
    else if (marker === "future potential") out.future_potential = value;
  }
  return out;
}

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
  const [openVersionIndex, setOpenVersionIndex] = useState<number | null>(null);
  const versions = session.inventions?.length
    ? session.inventions
    : inv
      ? [inv]
      : [];
  const latestVersionIndex = versions.length - 1;
  const parsedFromDescription = parseLabeledConceptText(inv?.description || "");
  const parsedSectionCount = Object.values(parsedFromDescription).filter(Boolean).length;
  const hasTemplateFields =
    Boolean(inv?.product_name) ||
    Boolean(inv?.what_is_it) ||
    Boolean(inv?.why_does_it_exist) ||
    Boolean(inv?.who_is_it_for) ||
    parsedSectionCount >= 3;

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
      {count > 0 ? (
        <div className="space-y-1">
          <p className="text-xs text-slate-500">
            {count} saved version{count === 1 ? "" : "s"}. Open any version:
          </p>
          <div className="flex flex-wrap gap-2">
            {versions.map((version, idx) => {
              const isLatest = idx === latestVersionIndex;
              return (
                <button
                  key={`inv-version-${idx}`}
                  type="button"
                  className={`rounded-md border px-2 py-1 text-xs font-medium ${
                    isLatest
                      ? "border-indigo-300 bg-indigo-50 text-indigo-800"
                      : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                  }`}
                  onClick={() => setOpenVersionIndex(idx)}
                >
                  Version {idx + 1} {isLatest ? "(Latest)" : ""}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
      {openVersionIndex !== null && versions[openVersionIndex] ? (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-900/45 p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => setOpenVersionIndex(null)}
        >
          <div
            className="max-h-[85vh] w-full max-w-4xl overflow-y-auto rounded-xl border border-slate-200 bg-white p-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-900">
                Product Concept Version {openVersionIndex + 1}
                {openVersionIndex === latestVersionIndex ? " (Latest)" : ""}
              </h3>
              <button
                type="button"
                className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                onClick={() => setOpenVersionIndex(null)}
              >
                Close
              </button>
            </div>
            {(() => {
              const active = versions[openVersionIndex];
              const parsed = parseLabeledConceptText(active.description || "");
              const parsedCount = Object.values(parsed).filter(Boolean).length;
              const showTemplate =
                Boolean(active.product_name) ||
                Boolean(active.what_is_it) ||
                Boolean(active.why_does_it_exist) ||
                Boolean(active.who_is_it_for) ||
                parsedCount >= 3;
              return showTemplate ? (
                <div className="grid gap-2 text-xs text-slate-700 md:grid-cols-2">
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-2">
                    <p className="m-0 text-[11px] font-semibold uppercase tracking-wide text-slate-500">1. Product Name</p>
                    <p className="mt-1">{active.product_name || active.title || "-"}</p>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-2">
                    <p className="m-0 text-[11px] font-semibold uppercase tracking-wide text-slate-500">2. What is it?</p>
                    <p className="mt-1">{active.what_is_it || parsed.what_is_it || active.description || "-"}</p>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-2">
                    <p className="m-0 text-[11px] font-semibold uppercase tracking-wide text-slate-500">3. Why does it exist?</p>
                    <p className="mt-1">{active.why_does_it_exist || parsed.why_does_it_exist || "-"}</p>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-2">
                    <p className="m-0 text-[11px] font-semibold uppercase tracking-wide text-slate-500">4. Who is it for?</p>
                    <p className="mt-1">{active.who_is_it_for || parsed.who_is_it_for || "-"}</p>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-2">
                    <p className="m-0 text-[11px] font-semibold uppercase tracking-wide text-slate-500">5. Value Provided</p>
                    <p className="mt-1">{active.value_provided || parsed.value_provided || active.benefits || "-"}</p>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-2">
                    <p className="m-0 text-[11px] font-semibold uppercase tracking-wide text-slate-500">6. Core Capabilities</p>
                    <ul className="ml-4 mt-1 list-disc space-y-0.5">
                      {(active.core_capabilities && active.core_capabilities.length > 0
                        ? active.core_capabilities
                        : ["-"]).map((cap, idx) => (
                        <li key={`${cap}-${idx}`}>{cap}</li>
                      ))}
                    </ul>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-2">
                    <p className="m-0 text-[11px] font-semibold uppercase tracking-wide text-slate-500">7. Differentiator</p>
                    <p className="mt-1">{active.how_is_it_different || parsed.how_is_it_different || "-"}</p>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-2">
                    <p className="m-0 text-[11px] font-semibold uppercase tracking-wide text-slate-500">8. Business Goal</p>
                    <p className="mt-1">{active.business_goal || parsed.business_goal || "-"}</p>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-2">
                    <p className="m-0 text-[11px] font-semibold uppercase tracking-wide text-slate-500">9. Success Looks Like</p>
                    <p className="mt-1">{active.success_looks_like || parsed.success_looks_like || "-"}</p>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-2">
                    <p className="m-0 text-[11px] font-semibold uppercase tracking-wide text-slate-500">10. Future Potential</p>
                    <p className="mt-1">{active.future_potential || parsed.future_potential || active.next_steps || "-"}</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-2 text-xs text-slate-700">
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-2">
                    <p className="m-0 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Overview</p>
                    <p className="mt-1 text-sm text-slate-800">{active.description || "-"}</p>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-2">
                    <p className="m-0 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Benefits</p>
                    <p className="mt-1">{active.benefits || "-"}</p>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-2">
                    <p className="m-0 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Next Steps</p>
                    <p className="mt-1">{active.next_steps || "-"}</p>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      ) : null}
    </section>
  );
}
