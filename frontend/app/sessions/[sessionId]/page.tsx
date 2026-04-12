import { SessionDetailClient } from "./SessionDetailClient";

export default function SessionDetailPage({
  params,
}: {
  params: { sessionId: string };
}) {
  return <SessionDetailClient sessionId={params.sessionId} />;
}
