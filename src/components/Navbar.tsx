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
    <header className="sticky top-0 z-20 border-b border-[#2B1B12]/[0.06] bg-[#F5F1E8]/80 backdrop-blur-2xl">
      <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-4 px-4 py-3 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
        <Link href="/" className="flex items-center gap-3 group">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#C47A2C] to-[#D4943F] text-sm font-bold text-white shadow-[0_4px_16px_rgba(196,122,44,0.25)] transition group-hover:shadow-[0_4px_24px_rgba(196,122,44,0.4)]">
            FC
          </span>
          <div>
            <p className="text-sm font-semibold tracking-[0.08em] text-[#2B1B12]">
              FlowCart
            </p>
            <p className="text-[11px] text-[#2B1B12]/40">Upload once. Launch everywhere.</p>
          </div>
        </Link>

        <nav className="flex flex-wrap items-center gap-1 rounded-2xl border border-[#2B1B12]/[0.06] bg-white/50 px-2 py-1.5 backdrop-blur-xl">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`relative flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-all duration-200 ${
                  isActive
                    ? "bg-[#C47A2C]/10 text-[#C47A2C] shadow-sm"
                    : "text-[#2B1B12]/50 hover:bg-[#2B1B12]/[0.04] hover:text-[#2B1B12]/80"
                }`}
              >
                <Icon size={15} />
                {item.label}
                {isActive && (
                  <span className="absolute bottom-0 left-1/2 -translate-x-1/2 h-[2px] w-8 rounded-full bg-gradient-to-r from-[#C47A2C] to-[#D4943F]" />
                )}
              </Link>
            );
          })}

          {!loading && user ? (
            <>
              <span className="hidden sm:block px-3 text-xs text-[#2B1B12]/30 truncate max-w-[140px]">
                {user.email}
              </span>
              <button
                type="button"
                onClick={signOut}
                className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium text-red-500/70 transition-all hover:bg-red-500/10 hover:text-red-600"
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
