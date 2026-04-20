"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
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
    <motion.header
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="sticky top-0 z-20 border-b border-amber-100/12 bg-[#090806]/78 backdrop-blur-2xl"
    >
      <div className="mx-auto flex w-full max-w-[1240px] flex-col gap-4 px-4 py-3 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-10">
        <Link href="/" className="flex items-center gap-3 group">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#D8A45E] via-[#C98539] to-[#8D5520] text-sm font-bold text-white shadow-[0_8px_24px_rgba(216,164,94,0.3)] transition group-hover:shadow-[0_10px_30px_rgba(216,164,94,0.45)]">
            FC
          </span>
          <div>
            <p className="text-sm font-semibold tracking-[0.08em] text-amber-50">
              FlowCart
            </p>
            <p className="text-[11px] text-amber-50/50">Upload once. Launch everywhere.</p>
          </div>
        </Link>

        <nav className="flex flex-wrap items-center gap-1 rounded-2xl border border-amber-100/16 bg-white/6 px-2 py-1.5 backdrop-blur-xl">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`relative flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-all duration-200 ${
                  isActive
                    ? "bg-amber-300/16 text-amber-100 shadow-[0_0_18px_rgba(245,158,11,0.2)]"
                    : "text-amber-50/68 hover:bg-white/10 hover:text-amber-50"
                }`}
              >
                <Icon size={15} />
                {item.label}
                {isActive && (
                  <span className="absolute bottom-0 left-1/2 h-[2px] w-8 -translate-x-1/2 rounded-full bg-gradient-to-r from-[#E2B16B] to-[#B46B27]" />
                )}
              </Link>
            );
          })}

          {!loading && user ? (
            <>
              <span className="hidden max-w-[140px] truncate px-3 text-xs text-amber-50/45 sm:block">
                {user.email}
              </span>
              <button
                type="button"
                onClick={signOut}
                className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium text-red-200/80 transition-all hover:bg-red-500/15 hover:text-red-100"
              >
                <LogOut size={14} />
                Logout
              </button>
            </>
          ) : null}
        </nav>
      </div>
    </motion.header>
  );
}
