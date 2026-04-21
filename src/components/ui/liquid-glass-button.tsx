"use client";

import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cn } from "@/src/lib/cn";

type LiquidButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type LiquidButtonSize = "sm" | "md" | "lg" | "xl" | "icon";

const variantClass: Record<LiquidButtonVariant, string> = {
  primary:
    "border border-[color:rgba(12,95,168,0.92)] bg-[linear-gradient(155deg,#0f6cbd_0%,#0c5fa8_58%,#0a4f8a_100%)] text-white shadow-[0_14px_28px_rgba(15,108,189,0.32),inset_0_1px_0_rgba(255,255,255,0.26)]",
  secondary:
    "border border-[color:rgba(106,84,209,0.34)] bg-[linear-gradient(155deg,rgba(255,255,255,0.98),rgba(242,238,255,0.94))] text-[color:var(--fc-text-primary)] shadow-[0_10px_22px_rgba(58,79,117,0.14),inset_0_1px_0_rgba(255,255,255,0.94)]",
  ghost:
    "border border-[color:rgba(15,108,189,0.18)] bg-white/86 text-[color:var(--fc-text-primary)] shadow-[0_8px_18px_rgba(42,72,110,0.11),inset_0_1px_0_rgba(255,255,255,0.86)]",
  danger:
    "border border-[color:rgba(194,65,58,0.54)] bg-[linear-gradient(155deg,#c2413a_0%,#a43631_100%)] text-white shadow-[0_12px_24px_rgba(194,65,58,0.27),inset_0_1px_0_rgba(255,255,255,0.18)]",
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
          "group relative inline-flex items-center justify-center overflow-hidden rounded-full font-semibold tracking-[0.01em] outline-none backdrop-blur-sm transition-[transform,box-shadow,filter,border-color] duration-200 ease-out",
          "focus-visible:ring-2 focus-visible:ring-[color:var(--fc-focus-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--fc-background)]",
          "disabled:pointer-events-none disabled:opacity-65 disabled:saturate-50 disabled:brightness-[0.98]",
          "before:pointer-events-none before:absolute before:inset-0 before:rounded-full before:bg-[radial-gradient(circle_at_22%_14%,rgba(255,255,255,0.52),rgba(255,255,255,0)_56%)]",
          "after:pointer-events-none after:absolute after:inset-0 after:rounded-full after:opacity-0 after:transition-opacity after:duration-300",
          "after:bg-[linear-gradient(110deg,rgba(76,200,255,0),rgba(76,200,255,0.28),rgba(106,84,209,0.22),rgba(76,200,255,0))] after:bg-[length:220%_100%]",
          "hover:-translate-y-0.5 hover:brightness-[1.02] hover:shadow-[0_14px_30px_rgba(33,73,120,0.22)] hover:after:opacity-100 hover:after:animate-[shimmer_0.95s_ease-out_1] active:translate-y-px active:scale-[0.992]",
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
