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
        "relative inline-flex list-none items-center rounded-2xl border border-black/15 bg-white/88 p-1 shadow-[0_10px_26px_rgba(0,0,0,0.1)] backdrop-blur",
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
        className="pointer-events-none absolute inset-y-1 z-0 rounded-xl bg-black"
      />
      <motion.li
        animate={{
          left: cursor.left + cursor.width / 2 - 26,
          opacity: cursor.opacity,
        }}
        transition={{ type: "spring", stiffness: 280, damping: 28 }}
        className="pointer-events-none absolute top-0 z-0 h-[4px] w-[52px] rounded-full bg-[linear-gradient(90deg,#00d4ff,#41ff8f,#ffd84d,#ff4ecd)] blur-[0.3px]"
      />

      {items.map((item) => {
        const content = (
          <span
            className={cn(
              "relative z-10 inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium transition-colors",
              activeKey === item.key ? "text-white" : "text-black/60 hover:text-black"
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
