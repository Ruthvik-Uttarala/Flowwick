"use client";

import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cn } from "@/src/lib/cn";

type LiquidButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type LiquidButtonSize = "sm" | "md" | "lg" | "xl" | "icon";

const variantClass: Record<LiquidButtonVariant, string> = {
  primary:
    "border border-black/35 bg-[linear-gradient(158deg,#101010,#000)] text-white shadow-[0_14px_28px_rgba(0,0,0,0.26),inset_0_1px_0_rgba(255,255,255,0.24),inset_0_-10px_24px_rgba(255,255,255,0.04)]",
  secondary:
    "border border-black/20 bg-[linear-gradient(165deg,rgba(255,255,255,0.98),rgba(246,246,246,0.9))] text-black shadow-[0_10px_22px_rgba(0,0,0,0.14),inset_0_1px_0_rgba(255,255,255,0.9)]",
  ghost:
    "border border-black/16 bg-white/78 text-black shadow-[0_8px_18px_rgba(0,0,0,0.1),inset_0_1px_0_rgba(255,255,255,0.84)]",
  danger:
    "border border-black/35 bg-[linear-gradient(162deg,#2c2c2c,#121212)] text-white shadow-[0_12px_24px_rgba(0,0,0,0.24),inset_0_1px_0_rgba(255,255,255,0.2)]",
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
          "group relative inline-flex items-center justify-center overflow-hidden rounded-full font-semibold tracking-[0.01em] outline-none backdrop-blur-sm transition-[transform,box-shadow,filter] duration-200 ease-out",
          "focus-visible:ring-2 focus-visible:ring-black/45 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent",
          "disabled:pointer-events-none disabled:brightness-[0.96] disabled:saturate-50 disabled:opacity-70 disabled:shadow-[inset_0_1px_0_rgba(255,255,255,0.3)]",
          "before:pointer-events-none before:absolute before:inset-0 before:rounded-full before:bg-[radial-gradient(circle_at_22%_18%,rgba(255,255,255,0.52),rgba(255,255,255,0)_58%)]",
          "after:pointer-events-none after:absolute after:inset-0 after:rounded-full after:opacity-0 after:transition-opacity after:duration-300",
          "after:bg-[linear-gradient(105deg,rgba(0,212,255,0),rgba(0,212,255,0.38),rgba(93,255,162,0.4),rgba(255,208,86,0.36),rgba(255,104,220,0.3),rgba(0,212,255,0))] after:bg-[length:220%_100%]",
          "hover:-translate-y-0.5 hover:brightness-[1.02] hover:shadow-[0_12px_24px_rgba(0,0,0,0.18)] hover:after:opacity-100 hover:after:animate-[shimmer_0.9s_ease-out_1] active:translate-y-px active:scale-[0.99]",
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
