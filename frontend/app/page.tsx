import Link from "next/link";

export default function HomePage() {
  return (
    <div>
      <h1>SPARK Creativity Sessions</h1>
      <p>
        Turn a problem into structured SPARK, variations, perspectives, insights,
        invention, and enlightenment — with GenAI orchestration on the server.
      </p>
      <ul className="muted">
        <li>Start a new session with your problem statement</li>
        <li>Generate and edit SPARK (Situation, Parts, Actions, Role, Key goal)</li>
        <li>Run variations, apply creativity tools, then insights → invention → enlightenment</li>
        <li>Resume any time from session history</li>
      </ul>
      <p className="row">
        <Link href="/sessions/new">Start new session</Link>
        <span className="muted">·</span>
        <Link href="/sessions">Past sessions</Link>
      </p>
    </div>
  );
}
