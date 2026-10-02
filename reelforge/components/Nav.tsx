"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/", label: "Generate", icon: "✦" },
  { href: "/hooks", label: "Hooks", icon: "🪝" },
  { href: "/performance", label: "Performance", icon: "📈" },
  { href: "/history", label: "History", icon: "🕘" },
];

function isActive(path: string, href: string) {
  if (href === "/") return path === "/" || path.startsWith("/results");
  return path.startsWith(href);
}

export function Nav() {
  const path = usePathname() ?? "/";
  return (
    <>
      <header className="sticky top-0 z-30 border-b border-zinc-200 bg-zinc-50/90 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/90">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-4">
          <Link href="/" className="text-lg font-black tracking-tight">
            Reel<span className="text-brand">Forge</span>
          </Link>
          <nav className="hidden items-center gap-1 sm:flex">
            {TABS.map((t) => (
              <Link
                key={t.href}
                href={t.href}
                className={`rounded-lg px-3 py-2 text-sm font-semibold ${
                  isActive(path, t.href) ? "bg-brand text-white" : "hover:bg-zinc-200 dark:hover:bg-zinc-800"
                }`}
              >
                {t.label}
              </Link>
            ))}
          </nav>
          <Link
            href="/settings"
            aria-label="Settings"
            className={`rounded-lg px-3 py-2 text-sm font-semibold ${
              path.startsWith("/settings") ? "bg-brand text-white" : "hover:bg-zinc-200 dark:hover:bg-zinc-800"
            }`}
          >
            ⚙︎ <span className="hidden sm:inline">Settings</span>
          </Link>
        </div>
      </header>
      <nav
        className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-zinc-200 bg-white pb-[env(safe-area-inset-bottom)] dark:border-zinc-800 dark:bg-zinc-900 sm:hidden"
        aria-label="Main"
      >
        {TABS.map((t) => (
          <Link
            key={t.href}
            href={t.href}
            className={`flex min-h-[56px] flex-col items-center justify-center text-[11px] font-semibold ${
              isActive(path, t.href) ? "text-brand" : "text-zinc-500"
            }`}
          >
            <span className="text-lg leading-none">{t.icon}</span>
            {t.label}
          </Link>
        ))}
      </nav>
    </>
  );
}
