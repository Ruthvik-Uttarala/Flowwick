"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { useLayoutEffect, useRef, useState } from "react";
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
  const navItemRefs = useRef<Record<string, HTMLLIElement | null>>({});
  const [cursor, setCursor] = useState({ left: 0, width: 0, opacity: 0 });

  useLayoutEffect(() => {
    if (!activeKey) {
      return;
    }
    const activeItem = navItemRefs.current[activeKey];
    if (!activeItem) {
      return;
    }
    setCursor({
      left: activeItem.offsetLeft,
      width: activeItem.offsetWidth,
      opacity: 1,
    });
  }, [activeKey, items]);

  return (
    <ul
      className={cn(
        "relative inline-flex list-none items-center rounded-2xl border border-[color:rgba(15,108,189,0.2)] bg-white/90 p-1 shadow-[0_10px_24px_rgba(26,64,110,0.12)] backdrop-blur",
        className
      )}
      onMouseLeave={() => {
        if (!activeKey) {
          setCursor((prev) => ({ ...prev, opacity: 0 }));
          return;
        }
        const activeItem = navItemRefs.current[activeKey];
        if (!activeItem) {
          return;
        }
        setCursor({
          left: activeItem.offsetLeft,
          width: activeItem.offsetWidth,
          opacity: 1,
        });
      }}
      aria-label="Main"
    >
      <motion.li
        animate={cursor}
        transition={{ type: "spring", stiffness: 340, damping: 30, mass: 0.6 }}
        className="pointer-events-none absolute inset-y-1 z-0 rounded-xl bg-[linear-gradient(145deg,#0f6cbd,#0c5fa8)]"
      />
      <motion.li
        animate={{
          left: cursor.left + cursor.width / 2 - 24,
          opacity: cursor.opacity,
        }}
        transition={{ type: "spring", stiffness: 280, damping: 28 }}
        className="pointer-events-none absolute top-0 z-0 h-[3px] w-[48px] rounded-full bg-[linear-gradient(90deg,#4cc8ff,#6a54d1)]"
      />

      {items.map((item) => {
        const content = (
          <span
            className={cn(
              "relative z-10 inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium transition-colors",
              activeKey === item.key
                ? "text-white"
                : "text-[color:rgba(19,26,34,0.65)] hover:text-[color:var(--fc-text-primary)]"
            )}
          >
            {item.icon}
            <span className="hidden sm:inline">{item.label}</span>
          </span>
        );

        if (item.href) {
          return (
            <li
              key={item.key}
              ref={(el) => {
                navItemRefs.current[item.key] = el;
              }}
              onMouseEnter={(event) => {
                const target = event.currentTarget;
                setCursor({
                  left: target.offsetLeft,
                  width: target.offsetWidth,
                  opacity: 1,
                });
              }}
            >
              <Link href={item.href} className="rounded-xl focus-visible:outline-none">
                {content}
              </Link>
            </li>
          );
        }

        return (
          <li
            key={item.key}
            ref={(el) => {
              navItemRefs.current[item.key] = el;
            }}
            onMouseEnter={(event) => {
              const target = event.currentTarget;
              setCursor({
                left: target.offsetLeft,
                width: target.offsetWidth,
                opacity: 1,
              });
            }}
          >
            <button type="button" onClick={item.onClick} className="rounded-xl" aria-label={item.label}>
              {content}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
