"use client";

import { BottomNavigation } from "@/components/BottomNavigation";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <div className="min-h-screen text-slate-900">{children}</div>
      <BottomNavigation />
    </>
  );
}
