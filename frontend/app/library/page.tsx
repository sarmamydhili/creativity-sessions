import Link from "next/link";

export default function LibraryPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="text-2xl font-bold text-slate-900">Library</h1>
      <p className="mt-3 text-sm leading-relaxed text-slate-600">
        Save enlightenment excerpts and exported learnings here. File downloads
        from the enlightenment step are a simple starting point.
      </p>
      <p className="mt-4 text-sm text-slate-500">
        Open a session and complete the journey to extract learning, then use
        &quot;Save to file&quot; on the enlightenment card.
      </p>
      <Link
        href="/sessions"
        className="mt-6 inline-block text-sm font-medium text-spark-situation hover:underline"
      >
        Go to sessions →
      </Link>
    </div>
  );
}
