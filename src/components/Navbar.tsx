"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { Grid3x3, Home, Info, LogOut, Settings } from "lucide-react";
import { useAuth } from "@/src/context/AuthContext";

interface NavLink {
  key: string;
  href: string;
  label: string;
  icon: React.ReactNode;
}

export function Navbar() {
  const pathname = usePathname();
  const { user, loading, signOut } = useAuth();

  const navLinks: NavLink[] = user
    ? [
        {
          key: "home",
          href: "/",
          label: "Home",
          icon: <Home size={20} strokeWidth={1.8} />,
        },
        {
          key: "dashboard",
          href: "/dashboard",
          label: "Posts",
          icon: <Grid3x3 size={20} strokeWidth={1.8} />,
        },
        {
          key: "info",
          href: "/info",
          label: "Info",
          icon: <Info size={20} strokeWidth={1.8} />,
        },
        {
          key: "settings",
          href: "/settings",
          label: "Settings",
          icon: <Settings size={20} strokeWidth={1.8} />,
        },
      ]
    : [
        {
          key: "home",
          href: "/",
          label: "Home",
          icon: <Home size={20} strokeWidth={1.8} />,
        },
        {
          key: "info",
          href: "/info",
          label: "Info",
          icon: <Info size={20} strokeWidth={1.8} />,
        },
        {
          key: "auth",
          href: "/auth",
          label: "Login",
          icon: <LogOut size={20} strokeWidth={1.8} />,
        },
      ];

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
      {/* Top bar — clean, sticky, off-white */}
      <header className="sticky top-0 z-30 border-b border-[color:var(--fc-border-subtle)] bg-[color:var(--fc-background)]/92 backdrop-blur">
        <div className="mx-auto flex w-full max-w-[1280px] items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
          <Link
            href="/"
            aria-label="FlowCart home"
            className="group inline-flex items-center"
          >
            {/* Desktop: horizontal symbol + wordmark */}
            <Image
              src="/brand/flowcart-horizontal.png"
              alt="FlowCart"
              width={520}
              height={160}
              priority
              className="hidden h-8 w-auto sm:block"
            />
            {/* Mobile: stacked symbol + wordmark renders compactly */}
            <span className="flex items-center gap-2 sm:hidden">
              <Image
                src="/brand/flowcart-symbol.png"
                alt=""
                width={64}
                height={64}
                priority
                className="h-7 w-auto"
              />
              <span className="text-lg font-semibold tracking-tight text-[color:var(--fc-text-primary)]">
                FlowCart
              </span>
            </span>
          </Link>

          {/* Desktop nav */}
          <nav
            className="hidden items-center gap-1 md:flex"
            aria-label="Primary"
          >
            {navLinks.map((item) => {
              const isActive = item.key === activeKey;
              return (
                <Link
                  key={item.key}
                  href={item.href}
                  className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition ${
                    isActive
                      ? "bg-[color:var(--fc-surface-muted)] text-[color:var(--fc-text-primary)]"
                      : "text-[color:var(--fc-text-muted)] hover:bg-[color:var(--fc-surface-muted)] hover:text-[color:var(--fc-text-primary)]"
                  }`}
                  aria-current={isActive ? "page" : undefined}
                >
                  <span
                    className={
                      isActive ? "text-[color:var(--fc-text-primary)]" : ""
                    }
                  >
                    {item.icon}
                  </span>
                  <span>{item.label}</span>
                </Link>
              );
            })}
            {!loading && user ? (
              <button
                type="button"
                onClick={signOut}
                className="ml-1 inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-[color:var(--fc-text-muted)] transition hover:bg-[color:var(--fc-surface-muted)] hover:text-[color:var(--fc-text-primary)]"
              >
                <LogOut size={18} strokeWidth={1.8} />
                <span>Logout</span>
              </button>
            ) : null}
          </nav>

          {/* Mobile top-right: Logout for signed-in users, Login pill otherwise */}
          <div className="flex items-center md:hidden">
            {!loading && user ? (
              <button
                type="button"
                onClick={signOut}
                aria-label="Logout"
                className="inline-flex h-10 w-10 items-center justify-center rounded-full text-[color:var(--fc-text-primary)]"
              >
                <LogOut size={22} strokeWidth={1.8} />
              </button>
            ) : (
              <Link
                href="/auth"
                className="rounded-lg bg-[#111111] px-3 py-1.5 text-sm font-semibold text-white"
              >
                Login
              </Link>
            )}
          </div>
        </div>
      </header>

      {/* Mobile bottom tab bar — Instagram-simple, thumb-friendly */}
      <nav
        aria-label="Mobile primary"
        className="fixed bottom-0 left-0 right-0 z-30 border-t border-[color:var(--fc-border-subtle)] bg-white/96 backdrop-blur md:hidden"
      >
        <ul className="mx-auto flex w-full max-w-[600px] items-center justify-around px-2 pb-[max(env(safe-area-inset-bottom),0.25rem)] pt-1.5">
          {navLinks.map((item) => {
            const isActive = item.key === activeKey;
            return (
              <li key={item.key} className="flex-1">
                <Link
                  href={item.href}
                  className="flex min-h-[52px] flex-col items-center justify-center gap-0.5 py-1.5"
                  aria-current={isActive ? "page" : undefined}
                >
                  <span
                    className={
                      isActive
                        ? "text-[color:var(--fc-text-primary)]"
                        : "text-[color:var(--fc-text-muted)]"
                    }
                  >
                    {item.icon}
                  </span>
                  <span
                    className={`text-[10px] font-medium ${
                      isActive
                        ? "text-[color:var(--fc-text-primary)]"
                        : "text-[color:var(--fc-text-muted)]"
                    }`}
                  >
                    {item.label}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}
