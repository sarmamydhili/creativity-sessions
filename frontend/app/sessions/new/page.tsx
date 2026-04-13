import Link from "next/link";
import { SessionForm } from "@/components/SessionForm";

export default function NewSessionPage({
  searchParams,
}: {
  searchParams: { template?: string };
}) {
  return (
    <div className="mx-auto max-w-xl px-2 py-8">
      <p className="mb-6 text-sm">
        <Link href="/" className="font-medium text-spark-situation hover:underline">
          ← Home
        </Link>
        <span className="mx-2 text-slate-300">·</span>
        <Link href="/sessions" className="text-slate-600 hover:underline">
          Sessions
        </Link>
      </p>
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">
        New session
      </h1>
      <p className="mt-2 text-sm text-slate-600">
        Name your challenge. You will land in the SPARK workspace to explore.
      </p>
      <div className="mt-8">
        <SessionForm templateTitle={searchParams.template} />
      </div>
    </div>
  );
}
