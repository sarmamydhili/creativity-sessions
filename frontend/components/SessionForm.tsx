"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createSession } from "@/lib/api";
import {
  EXPERIENCE_OPTIONS,
  PROJECT_TYPE_OPTIONS,
  parseExperienceMode,
  parseProjectType,
  type ExperienceMode,
  type ProjectType,
} from "@/lib/experience";

export function SessionForm({
  templateTitle,
  initialMode,
  initialProjectType,
}: {
  templateTitle?: string;
  initialMode?: string;
  initialProjectType?: string;
}) {
  const router = useRouter();
  const [title, setTitle] = useState(templateTitle ?? "");
  const [problem, setProblem] = useState(
    "How can I help joggers stay hydrated more effectively while running?",
  );
  const [mode, setMode] = useState<ExperienceMode>(() => parseExperienceMode(initialMode));
  const [projectType, setProjectType] = useState<ProjectType>(() =>
    parseProjectType(initialProjectType),
  );

  useEffect(() => {
    if (templateTitle) setTitle(templateTitle);
  }, [templateTitle]);
  useEffect(() => {
    setMode(parseExperienceMode(initialMode));
  }, [initialMode]);
  useEffect(() => {
    const next = parseProjectType(initialProjectType);
    setProjectType(next);
    const sample = PROJECT_TYPE_OPTIONS.find((x) => x.value === next)?.samplePrompt;
    if (sample) setProblem(sample);
  }, [initialProjectType]);
  const [ownerId, setOwnerId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const s = await createSession({
        problem_statement: problem,
        title: title.trim() || null,
        owner_id: ownerId.trim() || null,
      });
      const qs = new URLSearchParams({
        mode,
        project: projectType,
      });
      router.push(`/sessions/${s.session_id}?${qs.toString()}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create");
    } finally {
      setLoading(false);
    }
  }

  function applyProjectType(nextType: ProjectType) {
    setProjectType(nextType);
    const sample = PROJECT_TYPE_OPTIONS.find((x) => x.value === nextType)?.samplePrompt;
    if (sample) setProblem(sample);
  }

  return (
    <form onSubmit={onSubmit} className="stack card">
      <div>
        <label className="label" htmlFor="project-type">
          What are you working on?
        </label>
        <select
          id="project-type"
          value={projectType}
          onChange={(e) => applyProjectType(parseProjectType(e.target.value))}
          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
        >
          {PROJECT_TYPE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="label">How would you like to work?</label>
        <div className="grid gap-2 sm:grid-cols-3">
          {EXPERIENCE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setMode(opt.value)}
              className={`rounded-xl border px-3 py-2 text-left ${
                mode === opt.value
                  ? "border-indigo-300 bg-indigo-50 text-indigo-900"
                  : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
              }`}
            >
              <div className="text-sm font-semibold">{opt.label}</div>
              <div className="mt-1 text-xs">{opt.hint}</div>
            </button>
          ))}
        </div>
      </div>
      <div>
        <label className="label" htmlFor="title">
          Title (optional)
        </label>
        <input
          id="title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Hydrating Jogger"
        />
      </div>
      <div>
        <label className="label" htmlFor="problem">
          What do you want to create or improve?
        </label>
        <textarea
          id="problem"
          rows={5}
          value={problem}
          onChange={(e) => setProblem(e.target.value)}
          required
        />
      </div>
      <div>
        <label className="label" htmlFor="owner">
          Owner ID (optional)
        </label>
        <input
          id="owner"
          value={ownerId}
          onChange={(e) => setOwnerId(e.target.value)}
          placeholder="optional"
        />
      </div>
      {error ? <p className="error">{error}</p> : null}
      <button type="submit" disabled={loading}>
        {loading ? "Creating…" : "Start session"}
      </button>
    </form>
  );
}
