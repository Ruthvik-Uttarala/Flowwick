"use client";

import * as React from "react";
import { cn } from "@/src/lib/cn";

interface RippleCirclesProps {
  className?: string;
  compact?: boolean;
}

export function RippleCircles({ className, compact = false }: RippleCirclesProps) {
  const sizeClass = compact ? "h-12 w-12" : "h-[220px] w-[220px]";
  const ringClass = compact ? "border-[1.5px]" : "border-2";

  return (
    <div className={cn("relative aspect-square", sizeClass, className)} aria-hidden="true">
      <span
        className={cn(
          "absolute inset-[42%] rounded-full border-cyan-400/70 bg-cyan-300/15 backdrop-blur-sm animate-[ripple_2s_infinite_ease-in-out]",
          ringClass
        )}
      />
      <span
        className={cn(
          "absolute inset-[31%] rounded-full border-cyan-500/55 bg-cyan-300/10 backdrop-blur-sm animate-[ripple_2s_infinite_ease-in-out_0.15s]",
          ringClass
        )}
      />
      <span
        className={cn(
          "absolute inset-[20%] rounded-full border-sky-500/45 bg-sky-300/8 backdrop-blur-sm animate-[ripple_2s_infinite_ease-in-out_0.3s]",
          ringClass
        )}
      />
      <span
        className={cn(
          "absolute inset-[10%] rounded-full border-indigo-400/35 bg-indigo-200/10 backdrop-blur-sm animate-[ripple_2s_infinite_ease-in-out_0.45s]",
          ringClass
        )}
      />
      <span
        className={cn(
          "absolute inset-0 rounded-full border-slate-300/35 bg-white/25 backdrop-blur-sm animate-[ripple_2s_infinite_ease-in-out_0.6s]",
          ringClass
        )}
      />
    </div>
  );
}
