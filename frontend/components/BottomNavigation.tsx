"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/", label: "Home", icon: "◆" },
  { href: "/explore", label: "Explore", icon: "◇" },
  { href: "/library", label: "Library", icon: "▤" },
  { href: "/profile", label: "Profile", icon: "○" },
] as const;

export function BottomNavigation() {
  const pathname = usePathname() ?? "/";

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 border-t border-slate-200 bg-white/95 pb-[max(0.5rem,env(safe-area-inset-bottom))] backdrop-blur-md shadow-[0_-4px_20px_rgba(15,23,42,0.06)]"
      aria-label="Primary"
    >
      <div className="mx-auto flex max-w-3xl items-stretch justify-around gap-1 px-2 py-2">
        {items.map(({ href, label, icon }) => {
          const active =
            href === "/"
              ? pathname === "/" || pathname === ""
              : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`flex min-w-[4.5rem] flex-col items-center justify-center rounded-xl px-3 py-2 text-xs font-medium transition ${
                active
                  ? "bg-slate-100 text-spark-situation"
                  : "text-slate-500 hover:bg-slate-50 hover:text-slate-800"
              }`}
            >
              <span className="text-base leading-none" aria-hidden>
                {icon}
              </span>
              <span className="mt-1">{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
