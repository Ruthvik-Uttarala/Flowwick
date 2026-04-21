"use client";

import * as React from "react";
import { cn } from "@/src/lib/cn";

type LiquidButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type LiquidButtonSize = "sm" | "md" | "lg" | "xl" | "icon";

const variantClass: Record<LiquidButtonVariant, string> = {
  primary:
    "border border-amber-300/50 bg-[linear-gradient(135deg,rgba(255,255,255,0.82),rgba(255,248,232,0.66),rgba(251,216,146,0.5))] text-slate-900 shadow-[0_10px_30px_rgba(243,183,95,0.35)]",
  secondary:
    "border border-slate-200/80 bg-[linear-gradient(135deg,rgba(255,255,255,0.82),rgba(245,250,255,0.62))] text-slate-800 shadow-[0_8px_24px_rgba(148,163,184,0.2)]",
  ghost:
    "border border-slate-300/70 bg-white/65 text-slate-800 shadow-[0_8px_24px_rgba(15,23,42,0.08)]",
  danger:
    "border border-rose-200 bg-[linear-gradient(135deg,rgba(255,255,255,0.86),rgba(255,237,237,0.78),rgba(254,205,211,0.64))] text-rose-700 shadow-[0_10px_26px_rgba(244,63,94,0.16)]",
};

const sizeClass: Record<LiquidButtonSize, string> = {
  sm: "h-9 px-3 text-xs",
  md: "h-10 px-4 text-sm",
  lg: "h-11 px-5 text-sm",
  xl: "h-12 px-6 text-base",
  icon: "h-10 w-10",
};

export interface LiquidButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: LiquidButtonVariant;
  size?: LiquidButtonSize;
  contentClassName?: string;
}

export const LiquidButton = React.forwardRef<HTMLButtonElement, LiquidButtonProps>(
  (
    {
      className,
      variant = "primary",
      size = "md",
      contentClassName,
      children,
      type = "button",
      ...props
    },
    ref
  ) => {
    return (
      <button
        ref={ref}
        type={type}
        className={cn(
          "group relative inline-flex items-center justify-center overflow-hidden rounded-full font-semibold tracking-[0.01em] outline-none transition duration-300 ease-out",
          "focus-visible:ring-2 focus-visible:ring-cyan-500/45 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent",
          "disabled:pointer-events-none disabled:opacity-50",
          "before:pointer-events-none before:absolute before:inset-0 before:rounded-full before:bg-[radial-gradient(circle_at_25%_20%,rgba(255,255,255,0.85),rgba(255,255,255,0)_58%)]",
          "after:pointer-events-none after:absolute after:inset-[1px] after:rounded-full after:bg-[linear-gradient(180deg,rgba(255,255,255,0.25),rgba(255,255,255,0.02))] after:opacity-90",
          "hover:-translate-y-0.5 hover:brightness-[1.03] active:translate-y-0 active:scale-[0.985]",
          variantClass[variant],
          sizeClass[size],
          className
        )}
        {...props}
      >
        <span className={cn("relative z-10 inline-flex items-center gap-2", contentClassName)}>
          {children}
        </span>
      </button>
    );
  }
);

LiquidButton.displayName = "LiquidButton";
