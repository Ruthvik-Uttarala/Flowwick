"use client";

import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cn } from "@/src/lib/cn";

type LiquidButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type LiquidButtonSize = "sm" | "md" | "lg" | "xl" | "icon";

const variantClass: Record<LiquidButtonVariant, string> = {
  // Instagram action blue, solid pill
  primary:
    "border border-transparent bg-[#0095f6] text-white hover:bg-[#1877f2] active:bg-[#1877f2]",
  // Soft white pill with strong text — Instagram secondary style
  secondary:
    "border border-[color:var(--fc-border-strong)] bg-white text-[color:var(--fc-text-primary)] hover:bg-[color:var(--fc-surface-muted)]",
  // Quiet ghost button
  ghost:
    "border border-[color:var(--fc-border-subtle)] bg-white text-[color:var(--fc-text-primary)] hover:bg-[color:var(--fc-surface-muted)]",
  // Instagram red destructive
  danger:
    "border border-transparent bg-[#ed4956] text-white hover:bg-[#dd3a47] active:bg-[#dd3a47]",
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
