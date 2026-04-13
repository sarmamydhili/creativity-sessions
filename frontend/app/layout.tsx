import type { Metadata } from "next";
import "./globals.css";
import { AppShell } from "@/components/AppShell";

export const metadata: Metadata = {
  title: "SPARK · Creativity Sessions",
  description:
    "Transform your thinking — SPARK framing, creative levers, perspectives, and learning.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-50 antialiased">
        <AppShell>
          <main className="mx-auto min-h-screen w-full max-w-[1800px] px-3 pt-4 pb-28 sm:px-5">
            {children}
          </main>
        </AppShell>
      </body>
    </html>
  );
}
