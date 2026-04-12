import Link from "next/link";
import { SessionForm } from "@/components/SessionForm";

export default function NewSessionPage() {
  return (
    <div>
      <h1>New session</h1>
      <p>
        <Link href="/sessions">Back to list</Link>
      </p>
      <SessionForm />
    </div>
  );
}
