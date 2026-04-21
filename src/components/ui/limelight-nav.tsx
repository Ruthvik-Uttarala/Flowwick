"use client";

import Link from "next/link";
import { useLayoutEffect, useRef } from "react";
import { cn } from "@/src/lib/cn";
import type { ReactNode } from "react";

export interface LimelightNavItem {
  key: string;
  label: string;
  icon: ReactNode;
  href?: string;
  onClick?: () => void;
}

interface LimelightNavProps {
  items: LimelightNavItem[];
  activeKey?: string;
  className?: string;
}

export function LimelightNav({ items, activeKey, className }: LimelightNavProps) {
  const navItemRefs = useRef<Record<string, HTMLSpanElement | null>>({});
  const limelightRef = useRef<HTMLSpanElement | null>(null);

  useLayoutEffect(() => {
    if (!activeKey || !limelightRef.current) {
      return;
    }
    const activeItem = navItemRefs.current[activeKey];
    if (!activeItem) {
      return;
    }

    const left = activeItem.offsetLeft + activeItem.offsetWidth / 2 - limelightRef.current.offsetWidth / 2;
    limelightRef.current.style.left = `${left}px`;
    limelightRef.current.style.opacity = "1";
  }, [activeKey, items]);

  return (
    <nav
      className={cn(
        "relative inline-flex items-center gap-1 rounded-2xl border border-slate-200/80 bg-white/70 p-1.5 shadow-[0_14px_32px_rgba(15,23,42,0.08)] backdrop-blur-xl",
        className
      )}
      aria-label="Main"
    >
      <span
        ref={limelightRef}
        className="pointer-events-none absolute top-0 h-[4px] w-10 rounded-full bg-gradient-to-r from-amber-400 to-cyan-400 opacity-0 transition-[left,opacity] duration-300 ease-out"
      >
        <span className="absolute left-1/2 top-1.5 h-8 w-14 -translate-x-1/2 rounded-[999px] bg-gradient-to-b from-cyan-300/45 to-transparent blur-[8px]" />
      </span>
      {items.map((item) => {
        const content = (
          <span
            ref={(el) => {
              navItemRefs.current[item.key] = el;
            }}
            className={cn(
              "relative z-10 inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium transition",
              activeKey === item.key
                ? "bg-white text-slate-900 shadow-[0_8px_18px_rgba(14,116,144,0.16)]"
                : "text-slate-500 hover:bg-white/80 hover:text-slate-800"
            )}
          >
            {item.icon}
            <span className="hidden sm:inline">{item.label}</span>
          </span>
        );

        if (item.href) {
          return (
            <Link key={item.key} href={item.href}>
              {content}
            </Link>
          );
        }

        return (
          <button
            key={item.key}
            type="button"
            onClick={item.onClick}
            className="rounded-xl"
            aria-label={item.label}
          >
            {content}
          </button>
        );
      })}
    </nav>
  );
}
