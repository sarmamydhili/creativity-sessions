import Link from "next/link";

export default function ExplorePage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="text-2xl font-bold text-slate-900">Explore</h1>
      <p className="mt-3 text-sm leading-relaxed text-slate-600">
        Browse prompts, creativity patterns, and guided paths. This area is
        reserved for future content — your sessions stay the source of truth.
      </p>
      <Link
        href="/sessions/new"
        className="mt-6 inline-block text-sm font-medium text-spark-situation hover:underline"
      >
        Start a session →
      </Link>
    </div>
  );
}
