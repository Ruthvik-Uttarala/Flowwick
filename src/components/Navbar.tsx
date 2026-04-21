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
      className="sticky top-0 z-20 border-b border-black/10 bg-white/85 backdrop-blur-xl"
    >
      <div className="mx-auto flex w-full max-w-[1240px] flex-col gap-3 px-4 py-3 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-10">
        <Link href="/" className="group inline-flex items-center gap-3">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-black/20 bg-black text-sm font-bold text-white shadow-[0_8px_18px_rgba(0,0,0,0.2)] transition group-hover:scale-[1.02]">
            FC
          </span>
          <div>
            <p className="text-sm font-semibold tracking-[0.08em] text-black">FlowCart</p>
            <p className="text-[11px] text-black/55">Upload once. Launch everywhere.</p>
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
                className="inline-flex items-center gap-1.5 rounded-xl border border-black/20 bg-white px-3 py-2 text-sm font-medium text-black transition hover:bg-black/5"
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
