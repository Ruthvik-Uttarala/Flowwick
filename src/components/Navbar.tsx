"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/src/context/AuthContext";
import { LayoutDashboard, Settings, LogOut, Zap } from "lucide-react";

export function Navbar() {
  const pathname = usePathname();
  const { user, loading, signOut } = useAuth();

  const navItems = user
    ? [
        { href: "/", label: "Home", icon: Zap },
        { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
        { href: "/settings", label: "Settings", icon: Settings },
      ]
    : [
        { href: "/", label: "Home", icon: Zap },
        { href: "/auth", label: "Login", icon: LogOut },
      ];

  return (
    <header className="sticky top-0 z-20 border-b border-white/[0.06] bg-black/30 backdrop-blur-2xl">
      <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-4 px-4 py-3 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
        <Link href="/" className="flex items-center gap-3 group">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-400 to-cyan-400 text-sm font-bold text-black shadow-[0_4px_16px_rgba(52,211,153,0.3)] transition group-hover:shadow-[0_4px_24px_rgba(52,211,153,0.5)]">
            FC
          </span>
          <div>
            <p className="text-sm font-semibold tracking-[0.08em] text-white">
              FlowCart
            </p>
            <p className="text-[11px] text-white/40">Upload once. Launch everywhere.</p>
          </div>
        </Link>

        <nav className="flex flex-wrap items-center gap-1 rounded-2xl border border-white/[0.06] bg-white/[0.03] px-2 py-1.5 backdrop-blur-xl">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`relative flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-all duration-200 ${
                  isActive
                    ? "bg-white/10 text-white shadow-sm"
                    : "text-white/50 hover:bg-white/[0.06] hover:text-white/80"
                }`}
              >
                <Icon size={15} />
                {item.label}
                {isActive && (
                  <span className="absolute bottom-0 left-1/2 -translate-x-1/2 h-[2px] w-8 rounded-full bg-gradient-to-r from-emerald-400 to-cyan-400" />
                )}
              </Link>
            );
          })}

          {!loading && user ? (
            <>
              <span className="hidden sm:block px-3 text-xs text-white/30 truncate max-w-[140px]">
                {user.email}
              </span>
              <button
                type="button"
                onClick={signOut}
                className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium text-rose-400/80 transition-all hover:bg-rose-500/10 hover:text-rose-400"
              >
                <LogOut size={14} />
                Logout
              </button>
            </>
          ) : null}
        </nav>
      </div>
    </header>
  );
}
