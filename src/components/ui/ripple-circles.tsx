"use client";

import * as React from "react";
import { cn } from "@/src/lib/cn";

interface RippleCirclesProps {
  className?: string;
  compact?: boolean;
}

export function RippleCircles({ className, compact = false }: RippleCirclesProps) {
  const sizeClass = compact ? "h-14 w-14" : "h-[220px] w-[220px]";
  const ringClass = compact ? "border" : "border-[1.5px]";
  const rings = [40, 32, 24, 16, 8, 0];
  const palette = [
    "rgba(0, 208, 255, 0.85)",
    "rgba(66, 255, 172, 0.82)",
    "rgba(255, 214, 87, 0.78)",
    "rgba(255, 120, 204, 0.72)",
    "rgba(87, 130, 255, 0.68)",
    "rgba(16, 16, 16, 0.32)",
  ];

  return (
    <div className={cn("relative aspect-square", sizeClass, className)} aria-hidden="true">
      {rings.map((inset, index) => (
        <span
          key={inset}
          className={cn("absolute rounded-full backdrop-blur-[1px]", ringClass)}
          style={{
            inset: `${inset}%`,
            borderColor: palette[index],
            background:
              index < 5
                ? "linear-gradient(120deg, rgba(255,255,255,0.22), rgba(255,255,255,0.03))"
                : "linear-gradient(120deg, rgba(255,255,255,0.2), rgba(255,255,255,0.08))",
            animation: `contourBreath 2.2s ease-in-out infinite ${index * 0.14}s`,
            boxShadow:
              index < 5
                ? `0 0 ${8 + index * 2}px ${palette[index]}`
                : "0 0 8px rgba(0,0,0,0.09)",
          }}
        />
      ))}
    </div>
  );
}
