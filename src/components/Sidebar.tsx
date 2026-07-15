"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";

const links = [
  { href: "/", label: "Dashboard", icon: "📊" },
  { href: "/contacts", label: "Contacts", icon: "👥" },
  { href: "/campaigns", label: "Campaigns", icon: "📧" },
  { href: "/settings", label: "Settings", icon: "⚙️" },
];

export function Sidebar() {
  const pathname = usePathname();
  const { data: session } = useSession();

  if (pathname === "/login") {
    return null;
  }

  return (
    <aside className="w-64 shrink-0 border-r border-slate-200 bg-slate-950 text-white min-h-screen flex flex-col">
      <div className="p-6 border-b border-slate-800">
        <h1 className="text-lg font-bold tracking-tight">MailTrack</h1>
        <p className="text-xs text-slate-400 mt-1">Email campaigns & follow-ups</p>
      </div>
      <nav className="p-4 space-y-1 flex-1">
        {links.map((link) => {
          const active = pathname === link.href;
          return (
            <Link
              key={link.href}
              href={link.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                active
                  ? "bg-blue-600 text-white"
                  : "text-slate-300 hover:bg-slate-800 hover:text-white"
              }`}
            >
              <span>{link.icon}</span>
              {link.label}
            </Link>
          );
        })}
      </nav>
      <div className="p-4 border-t border-slate-800">
        {session?.user?.email && (
          <p className="text-xs text-slate-400 truncate mb-2" title={session.user.email}>
            {session.user.email}
          </p>
        )}
        <button
          type="button"
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="w-full px-3 py-2 text-xs border border-slate-700 rounded-lg text-slate-300 hover:bg-slate-800 hover:text-white transition-colors"
        >
          Sign out
        </button>
      </div>
    </aside>
  );
}
