"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/src/context/AuthContext";

export function Navbar() {
  const pathname = usePathname();
  const { user, loading, signOut } = useAuth();

  const navItems = user
    ? [
        { href: "/", label: "Home" },
        { href: "/dashboard", label: "Dashboard" },
        { href: "/settings", label: "Settings" },
      ]
    : [
        { href: "/", label: "Home" },
        { href: "/auth", label: "Login" },
      ];

  return (
    <header className="sticky top-0 z-20 border-b border-stone-200/60 bg-white/80 backdrop-blur-2xl">
      <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-4 px-4 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
        <div className="flex items-center gap-3">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-orange-400 to-amber-500 text-sm font-bold text-white shadow-[0_4px_16px_rgba(224,122,58,0.25)]">
            FC
          </span>
          <div>
            <p className="text-sm font-semibold tracking-[0.08em] text-stone-800">
              FlowCart
            </p>
            <p className="text-xs text-stone-500">Upload once. Launch everywhere.</p>
          </div>
        </div>

        <nav className="glass-card flex flex-wrap items-center gap-1 rounded-2xl px-2 py-1.5">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`rounded-xl px-4 py-2 text-sm font-medium transition ${
                  isActive
                    ? "bg-stone-800 text-white shadow-sm"
                    : "text-stone-600 hover:bg-stone-100 hover:text-stone-900"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
          {!loading && user ? (
            <>
              <span className="px-2 text-xs text-stone-500">
                {user.email}
              </span>
              <button
                type="button"
                onClick={signOut}
                className="rounded-xl px-4 py-2 text-sm font-medium text-rose-600 transition hover:bg-rose-50 hover:text-rose-800"
              >
                Logout
              </button>
            </>
          ) : null}
        </nav>
      </div>
    </header>
  );
}
