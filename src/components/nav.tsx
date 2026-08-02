"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/dashboard", label: "Visibility" },
  { href: "/prompts", label: "Prompts & Gaps" },
  { href: "/calendar", label: "Calendar" },
  { href: "/approvals", label: "Approvals" },
  { href: "/channels", label: "Channels" },
  { href: "/audit", label: "Audit Log" },
];

export function Nav() {
  const pathname = usePathname();
  return (
    <nav
      className="flex flex-col gap-1 border-r p-4"
      style={{ borderColor: "var(--line)", minWidth: "14rem" }}
    >
      <Link href="/" className="mb-4 font-extrabold tracking-tight">
        AEO<span style={{ color: "var(--gold)" }}>·</span>Autopilot
      </Link>
      {links.map((l) => {
        const active = pathname === l.href;
        return (
          <Link
            key={l.href}
            href={l.href}
            className="rounded-md px-3 py-2 text-sm"
            style={{
              background: active ? "var(--card)" : "transparent",
              color: active ? "var(--ink)" : "var(--ink-faint)",
              fontWeight: active ? 600 : 400,
              border: active ? "1px solid var(--line)" : "1px solid transparent",
            }}
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
