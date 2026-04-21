"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { LayoutDashboard, LogOut, Settings, Sparkles } from "lucide-react";
import { useAuth } from "@/src/context/AuthContext";
import { LimelightNav } from "@/src/components/ui/limelight-nav";
import { LiquidButton } from "@/src/components/ui/liquid-glass-button";

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
      className="sticky top-0 z-30 border-b border-[color:rgba(15,108,189,0.14)] bg-[rgba(250,252,255,0.9)] backdrop-blur-xl"
    >
      <div className="mx-auto flex w-full max-w-[1240px] flex-col gap-3 px-4 py-3 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-10">
        <Link href="/" className="group inline-flex items-center gap-3">
          <span className="inline-flex h-10 w-10 items-center justify-center overflow-hidden rounded-xl border border-[color:rgba(15,108,189,0.2)] bg-white shadow-[0_8px_18px_rgba(20,68,118,0.12)] transition group-hover:scale-[1.02]">
            <Image
              src="/brand/flowcart-logo-clean.png"
              alt="FlowCart logo"
              width={64}
              height={64}
              className="h-full w-full object-contain p-1"
              priority
            />
          </span>
          <div>
            <p className="text-sm font-semibold tracking-[0.01em] text-[color:var(--fc-text-primary)]">FlowCart</p>
            <p className="text-[11px] text-[color:var(--fc-text-muted)]">Upload once. Launch everywhere.</p>
          </div>
        </Link>

        <div className="flex flex-wrap items-center gap-2.5">
          <LimelightNav items={navItems} activeKey={activeKey} />
          {!loading && user ? (
            <>
              <span className="hidden max-w-[220px] truncate rounded-xl border border-[color:rgba(15,108,189,0.14)] bg-white/85 px-3 py-2 text-xs text-[color:var(--fc-text-muted)] sm:inline">
                {user.email}
              </span>
              <LiquidButton onClick={signOut} variant="ghost" size="sm" className="rounded-xl">
                <LogOut size={14} />
                Logout
              </LiquidButton>
            </>
          ) : null}
        </div>
      </div>
    </motion.header>
  );
}
