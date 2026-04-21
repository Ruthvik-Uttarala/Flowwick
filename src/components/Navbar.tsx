"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { LogOut } from "lucide-react";
import { useAuth } from "@/src/context/AuthContext";
import { cn } from "@/src/lib/cn";

export function Navbar() {
  const pathname = usePathname();
  const { user, loading, signOut } = useAuth();

  const isHome = pathname === "/";
  const isAuth = pathname.startsWith("/auth");
  const isDashboard = pathname.startsWith("/dashboard");
  const isSettings = pathname.startsWith("/settings");

  return (
    <header className="sticky top-0 z-30 border-b border-[var(--border)] bg-[var(--surface)]/95 backdrop-blur-md">
      <div className="mx-auto flex w-full max-w-[1200px] items-center justify-between px-5 py-3 sm:px-8">
        {/* Brand lockup */}
        <Link 
          href="/" 
          className="group flex items-center gap-3 focus-ring rounded-lg"
        >
          <span className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-sm transition-transform group-hover:scale-[1.02]">
            <Image
              src="/brand/flowcart-logo-clean.png"
              alt="FlowCart logo"
              width={36}
              height={36}
              className="h-full w-full object-contain p-0.5"
              priority
            />
          </span>
          <span className="text-[0.9375rem] font-semibold tracking-[-0.01em] text-[var(--foreground)]">
            FlowCart
          </span>
        </Link>

        {/* Navigation */}
        <nav className="flex items-center gap-1">
          {user ? (
            <>
              <NavLink href="/" active={isHome}>Home</NavLink>
              <NavLink href="/dashboard" active={isDashboard}>Dashboard</NavLink>
              <NavLink href="/settings" active={isSettings}>Settings</NavLink>
              
              <div className="ml-3 flex items-center gap-2">
                <span className="hidden max-w-[160px] truncate rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-1.5 text-xs text-[var(--muted-foreground)] sm:inline">
                  {user.email}
                </span>
                <button
                  onClick={signOut}
                  className="focus-ring inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-[var(--muted-foreground)] transition-colors hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
                >
                  <LogOut size={14} />
                  <span className="hidden sm:inline">Logout</span>
                </button>
              </div>
            </>
          ) : (
            <>
              <NavLink href="/" active={isHome}>Home</NavLink>
              {!loading && (
                <Link
                  href="/auth"
                  className={cn(
                    "focus-ring ml-2 inline-flex items-center rounded-full px-4 py-2 text-sm font-semibold transition-all",
                    isAuth
                      ? "bg-[var(--primary)] text-white"
                      : "border border-[var(--border-strong)] bg-[var(--surface)] text-[var(--foreground)] hover:bg-[var(--muted)]"
                  )}
                >
                  Login
                </Link>
              )}
            </>
          )}
        </nav>
      </div>
    </header>
  );
}

function NavLink({ 
  href, 
  active, 
  children 
}: { 
  href: string; 
  active: boolean; 
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "focus-ring rounded-lg px-3 py-2 text-sm font-medium transition-colors",
        active
          ? "text-[var(--primary)]"
          : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
      )}
    >
      {children}
    </Link>
  );
}
