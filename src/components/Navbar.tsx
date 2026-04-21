"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { LayoutDashboard, LogOut, Settings, Sparkles } from "lucide-react";
import { useAuth } from "@/src/context/AuthContext";
import { LimelightNav } from "@/src/components/ui/limelight-nav";

export function Navbar() {
  const pathname = usePathname();
  const { user, loading, signOut } = useAuth();

  const navItems = user
    ? [
        { key: "home", href: "/", label: "Home", icon: <Sparkles size={15} /> },
        { key: "dashboard", href: "/dashboard", label: "Dashboard", icon: <LayoutDashboard size={15} /> },
        { key: "settings", href: "/settings", label: "Settings", icon: <Settings size={15} /> },
      ]
    : [
        { key: "home", href: "/", label: "Home", icon: <Sparkles size={15} /> },
        { key: "auth", href: "/auth", label: "Login", icon: <LogOut size={15} /> },
      ];

  const activeKey = pathname.startsWith("/dashboard")
    ? "dashboard"
    : pathname.startsWith("/settings")
      ? "settings"
      : pathname.startsWith("/auth")
        ? "auth"
        : "home";

  return (
    <motion.header
      initial={{ opacity: 0, y: -12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="sticky top-0 z-20 border-b border-slate-200/80 bg-white/65 backdrop-blur-2xl"
    >
      <div className="mx-auto flex w-full max-w-[1240px] flex-col gap-3 px-4 py-3 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-10">
        <Link href="/" className="group inline-flex items-center gap-3">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-400 via-sky-400 to-amber-300 text-sm font-bold text-slate-900 shadow-[0_10px_24px_rgba(14,165,233,0.28)] transition group-hover:shadow-[0_14px_28px_rgba(14,165,233,0.35)]">
            FC
          </span>
          <div>
            <p className="text-sm font-semibold tracking-[0.08em] text-slate-900">FlowCart</p>
            <p className="text-[11px] text-slate-500">Upload once. Launch everywhere.</p>
          </div>
        </Link>

        <div className="flex flex-wrap items-center gap-2">
          <LimelightNav items={navItems} activeKey={activeKey} />
          {!loading && user ? (
            <>
              <span className="hidden max-w-[190px] truncate rounded-xl border border-slate-200 bg-white/80 px-3 py-2 text-xs text-slate-600 sm:inline">
                {user.email}
              </span>
              <button
                type="button"
                onClick={signOut}
                className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700 transition hover:bg-rose-100"
              >
                <LogOut size={14} />
                Logout
              </button>
            </>
          ) : null}
        </div>
      </div>
    </motion.header>
  );
}
