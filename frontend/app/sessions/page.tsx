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
    <div>
      <h1>Sessions</h1>
      <p className="muted">{total} total</p>
      {error ? <p className="error">{error}</p> : null}
      <p>
        <Link href="/sessions/new">New session</Link> ·{" "}
        <Link href="/">Home</Link>
      </p>
      <SessionList items={items} />
    </div>
  );
}
