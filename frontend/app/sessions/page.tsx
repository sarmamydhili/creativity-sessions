import Link from "next/link";
import { listSessions } from "@/lib/api";
import { SessionList } from "@/components/SessionList";

export default async function SessionsPage() {
  let error: string | null = null;
  let items: Awaited<ReturnType<typeof listSessions>>["items"] = [];
  let total = 0;
  try {
    const res = await listSessions({ limit: 50 });
    items = res.items;
    total = res.total;
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to load sessions";
  }

  return (
    <div className="mx-auto max-w-2xl px-2 py-8">
      <p className="mb-4 text-sm">
        <Link href="/" className="font-medium text-spark-situation hover:underline">
          ← Home
        </Link>
      </p>
      <h1 className="text-2xl font-bold text-slate-900">Sessions</h1>
      <p className="mt-1 text-sm text-slate-500">{total} total</p>
      {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
      <p className="mt-6">
        <Link
          href="/sessions/new"
          className="inline-flex rounded-xl bg-spark-situation px-4 py-2.5 text-sm font-semibold text-white shadow-soft"
        >
          New session
        </Link>
      </p>
      <div className="mt-8">
        <SessionList items={items} />
      </div>
    </div>
  );
}
