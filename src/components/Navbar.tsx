"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { Home, LogOut, PlusSquare, Settings } from "lucide-react";
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
        { key: "home", href: "/", label: "Home", icon: <Home size={22} strokeWidth={1.8} /> },
        {
          key: "dashboard",
          href: "/dashboard",
          label: "Posts",
          icon: <PlusSquare size={22} strokeWidth={1.8} />,
        },
        {
          key: "settings",
          href: "/settings",
          label: "Settings",
          icon: <Settings size={22} strokeWidth={1.8} />,
        },
      ]
    : [
        { key: "home", href: "/", label: "Home", icon: <Home size={22} strokeWidth={1.8} /> },
        { key: "auth", href: "/auth", label: "Login", icon: <LogOut size={22} strokeWidth={1.8} /> },
      ];

  const activeKey = pathname.startsWith("/dashboard")
    ? "dashboard"
    : pathname.startsWith("/settings")
      ? "settings"
      : pathname.startsWith("/auth")
        ? "auth"
        : "home";

  return (
    <>
      {/* Top bar — Instagram-style clean header */}
      <header className="sticky top-0 z-30 border-b border-[color:var(--fc-border-subtle)] bg-white/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-[975px] items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <Link href="/" className="group inline-flex items-center gap-2.5">
            <span className="inline-flex h-9 w-9 items-center justify-center overflow-hidden rounded-xl border border-[color:var(--fc-border-subtle)] bg-white">
              <Image
                src="/brand/flowcart-logo-clean.png"
                alt="FlowCart logo"
                width={64}
                height={64}
                className="h-full w-full object-contain p-1"
                priority
              />
            </span>
            <span className="text-lg font-semibold tracking-tight text-[color:var(--fc-text-primary)]">
              FlowCart
            </span>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden items-center gap-1 md:flex" aria-label="Primary">
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
                  <span className={isActive ? "text-[color:var(--fc-text-primary)]" : ""}>
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
                <LogOut size={20} strokeWidth={1.8} />
                <span>Logout</span>
              </button>
            ) : null}
          </nav>

          {/* Mobile: just show user-mail or login link to keep header clean */}
          <div className="flex items-center md:hidden">
            {!loading && user ? (
              <button
                type="button"
                onClick={signOut}
                aria-label="Logout"
                className="inline-flex h-9 w-9 items-center justify-center rounded-full text-[color:var(--fc-text-primary)]"
              >
                <LogOut size={22} strokeWidth={1.8} />
              </button>
            ) : (
              <Link
                href="/auth"
                className="rounded-lg bg-[#0095f6] px-3 py-1.5 text-sm font-semibold text-white"
              >
                Login
              </Link>
            )}
          </div>
        </div>
      </header>

      {/* Mobile bottom tab bar — Instagram-style */}
      {user ? (
        <nav
          aria-label="Mobile primary"
          className="fixed bottom-0 left-0 right-0 z-30 border-t border-[color:var(--fc-border-subtle)] bg-white/98 backdrop-blur md:hidden"
        >
          <ul className="mx-auto flex w-full max-w-[600px] items-center justify-around px-2 py-2">
            {navLinks.map((item) => {
              const isActive = item.key === activeKey;
              return (
                <li key={item.key} className="flex-1">
                  <Link
                    href={item.href}
                    className="flex flex-col items-center justify-center gap-0.5 py-1.5"
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
      ) : null}
    </>
  );
}
