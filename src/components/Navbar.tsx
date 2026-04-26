"use client";

import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Grid3x3, Home, Info, LogOut, Settings } from "lucide-react";
import { useAuth } from "@/src/context/AuthContext";

interface NavLink {
  key: string;
  href: string;
  label: string;
  icon: ReactNode;
}

const LOGGED_IN_NAV: NavLink[] = [
  {
    key: "home",
    href: "/",
    label: "Home",
    icon: <Home size={18} strokeWidth={1.9} />,
  },
  {
    key: "dashboard",
    href: "/dashboard",
    label: "Posts",
    icon: <Grid3x3 size={18} strokeWidth={1.9} />,
  },
  {
    key: "info",
    href: "/info",
    label: "Info",
    icon: <Info size={18} strokeWidth={1.9} />,
  },
  {
    key: "settings",
    href: "/settings",
    label: "Settings",
    icon: <Settings size={18} strokeWidth={1.9} />,
  },
];

const LOGGED_OUT_NAV: NavLink[] = [
  {
    key: "home",
    href: "/",
    label: "Home",
    icon: <Home size={18} strokeWidth={1.9} />,
  },
  {
    key: "info",
    href: "/info",
    label: "Info",
    icon: <Info size={18} strokeWidth={1.9} />,
  },
  {
    key: "auth",
    href: "/auth",
    label: "Login",
    icon: <LogOut size={18} strokeWidth={1.9} />,
  },
];

export function Navbar() {
  const pathname = usePathname();
  const { user, loading, signOut } = useAuth();

  const navLinks = user ? LOGGED_IN_NAV : LOGGED_OUT_NAV;

  const activeKey = pathname.startsWith("/dashboard")
    ? "dashboard"
    : pathname.startsWith("/info")
      ? "info"
      : pathname.startsWith("/settings")
        ? "settings"
        : pathname.startsWith("/auth")
          ? "auth"
          : "home";

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-[color:var(--fc-border-strong)] bg-[color:var(--fc-background)]/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-[1280px] items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
          <Link href="/" aria-label="FlowCart home" className="inline-flex items-center">
            <Image
              src="/brand/flowcart-horizontal.png"
              alt="FlowCart"
              width={640}
              height={200}
              priority
              className="hidden h-auto w-[138px] sm:block md:w-[148px]"
            />
            <Image
              src="/brand/flowcart-horizontal.png"
              alt="FlowCart"
              width={480}
              height={150}
              priority
              className="h-auto w-[112px] sm:hidden"
            />
          </Link>

          <nav className="hidden items-center gap-1 md:flex" aria-label="Primary">
            {navLinks.map((item) => {
              const isActive = item.key === activeKey;
              return (
                <Link
                  key={item.key}
                  href={item.href}
                  className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition ${
                    isActive
                      ? "border border-[#111111] bg-[color:var(--fc-surface-muted)] text-[#111111]"
                      : "border border-transparent text-[color:var(--fc-text-muted)] hover:border-[color:var(--fc-border-subtle)] hover:bg-[color:var(--fc-surface-muted)] hover:text-[#111111]"
                  }`}
                  aria-current={isActive ? "page" : undefined}
                >
                  {item.icon}
                  <span>{item.label}</span>
                </Link>
              );
            })}
            {!loading && user ? (
              <button
                type="button"
                onClick={signOut}
                className="ml-1 inline-flex items-center gap-2 rounded-lg border border-transparent px-3 py-2 text-sm font-medium text-[color:var(--fc-text-muted)] transition hover:border-[color:var(--fc-border-subtle)] hover:bg-[color:var(--fc-surface-muted)] hover:text-[#111111]"
              >
                <LogOut size={18} strokeWidth={1.9} />
                <span>Logout</span>
              </button>
            ) : null}
          </nav>

          <div className="flex items-center md:hidden">
            {!loading && user ? (
              <button
                type="button"
                onClick={signOut}
                className="inline-flex h-10 items-center justify-center rounded-lg border border-[color:var(--fc-border-subtle)] px-3 text-sm font-semibold text-[color:var(--fc-text-primary)]"
              >
                Logout
              </button>
            ) : (
              <Link
                href="/auth"
                className="inline-flex h-10 items-center justify-center rounded-lg bg-[#111111] px-4 text-sm font-semibold text-white"
              >
                Login
              </Link>
            )}
          </div>
        </div>
      </header>

      {!loading && user ? (
        <nav
          aria-label="Mobile primary"
          className="fixed bottom-0 left-0 right-0 z-40 border-t border-[color:var(--fc-border-strong)] bg-white/98 backdrop-blur md:hidden"
        >
          <ul className="mx-auto grid w-full max-w-[560px] grid-cols-4 px-2 pb-[max(env(safe-area-inset-bottom),0.35rem)] pt-1">
            {LOGGED_IN_NAV.map((item) => {
              const isActive = item.key === activeKey;
              return (
                <li key={item.key}>
                  <Link
                    href={item.href}
                    className={`flex min-h-[56px] flex-col items-center justify-center gap-1 rounded-lg px-1 ${
                      isActive
                        ? "bg-[color:var(--fc-surface-muted)] text-[#111111]"
                        : "text-[color:var(--fc-text-muted)]"
                    }`}
                    aria-current={isActive ? "page" : undefined}
                  >
                    {item.icon}
                    <span className="text-[11px] font-medium">{item.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      ) : null}
    </>
  );
}
