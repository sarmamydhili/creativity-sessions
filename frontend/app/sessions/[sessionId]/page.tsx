import { SessionDetailClient } from "./SessionDetailClient";

export default function SessionDetailPage({
  params,
  searchParams,
}: {
  params: { sessionId: string };
  searchParams: { mode?: string; project?: string };
}) {
  return (
    <SessionDetailClient
      sessionId={params.sessionId}
      initialMode={searchParams.mode}
      initialProjectType={searchParams.project}
    />
  );
}
