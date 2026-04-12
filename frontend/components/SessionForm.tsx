"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createSession } from "@/lib/api";

export function SessionForm() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [problem, setProblem] = useState(
    "How can I help joggers stay hydrated more effectively while running?",
  );
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
      router.push(`/sessions/${s.session_id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="stack card">
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
          Problem statement
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
        {loading ? "Creating…" : "Create session"}
      </button>
    </form>
  );
}
