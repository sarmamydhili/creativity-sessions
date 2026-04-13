import Link from "next/link";

export default function ProfilePage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="text-2xl font-bold text-slate-900">Profile</h1>
      <p className="mt-3 text-sm leading-relaxed text-slate-600">
        User accounts and preferences can plug in here. The creativity API
        already supports optional <code className="rounded bg-slate-100 px-1">owner_id</code>{" "}
        on sessions for future scoping.
      </p>
      <Link
        href="/"
        className="mt-6 inline-block text-sm font-medium text-spark-situation hover:underline"
      >
        Home →
      </Link>
    </div>
  );
}
