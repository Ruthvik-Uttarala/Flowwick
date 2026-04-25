"use client";

import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cn } from "@/src/lib/cn";

type LiquidButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "success";
type LiquidButtonSize = "sm" | "md" | "lg" | "xl" | "icon";

const variantClass: Record<LiquidButtonVariant, string> = {
  // Primary: solid black, white text — Vercel/GitHub clean
  primary:
    "border border-transparent bg-[#111111] text-white hover:bg-[#000000] active:bg-[#000000]",
  // Secondary: white surface, strong border, dark text
  secondary:
    "border border-[color:var(--fc-border-strong)] bg-white text-[color:var(--fc-text-primary)] hover:bg-[color:var(--fc-surface-muted)]",
  // Ghost: minimal, subtle borders
  ghost:
    "border border-[color:var(--fc-border-subtle)] bg-white text-[color:var(--fc-text-primary)] hover:bg-[color:var(--fc-surface-muted)]",
  // Destructive: black outline (per brief — not red by default)
  danger:
    "border border-[color:var(--fc-text-primary)] bg-white text-[color:var(--fc-text-primary)] hover:bg-[color:var(--fc-text-primary)] hover:text-white active:bg-[#000000] active:text-white",
  // Success: clean green for confirmations
  success:
    "border border-transparent bg-[#16a34a] text-white hover:bg-[#15803d] active:bg-[#15803d]",
};

const sizeClass: Record<LiquidButtonSize, string> = {
  sm: "h-8 px-3 text-xs",
  md: "h-9 px-4 text-sm",
  lg: "h-10 px-5 text-sm",
  xl: "h-12 px-6 text-base",
  icon: "h-9 w-9",
};

export interface LiquidButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: LiquidButtonVariant;
  size?: LiquidButtonSize;
  contentClassName?: string;
  asChild?: boolean;
}

export const LiquidButton = React.forwardRef<HTMLButtonElement, LiquidButtonProps>(
  (
    {
      className,
      variant = "primary",
      size = "md",
      contentClassName,
      asChild = false,
      children,
      type = "button",
      ...props
    },
    ref
  ) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        ref={ref}
        type={asChild ? undefined : type}
        className={cn(
          "group relative inline-flex items-center justify-center rounded-lg font-semibold tracking-[0.005em] outline-none transition-[background-color,color,border-color,box-shadow,transform] duration-150 ease-out",
          "focus-visible:ring-2 focus-visible:ring-[color:var(--fc-focus-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-white",
          "disabled:pointer-events-none disabled:opacity-50",
          "active:scale-[0.985]",
          variantClass[variant],
          sizeClass[size],
          className
        )}
        {...props}
      >
        <span className={cn("relative z-10 inline-flex items-center gap-2", contentClassName)}>
          {children}
        </span>
      </Comp>
    );
  }
);

LiquidButton.displayName = "LiquidButton";
