"use client";

import { useEffect, useMemo, useState } from "react";
import { cn } from "@/src/lib/cn";

interface CharacterEyesProps {
  pupilOffsetX: number;
  pupilOffsetY: number;
  blinking: boolean;
}

function CharacterEyes({ pupilOffsetX, pupilOffsetY, blinking }: CharacterEyesProps) {
  const eyeClass = blinking ? "h-[3px] w-8" : "h-7 w-8";
  return (
    <div className="flex items-center gap-3">
      {[0, 1].map((id) => (
        <div key={id} className={cn("relative overflow-hidden rounded-full bg-white/95 transition-all", eyeClass)}>
          {!blinking ? (
            <span
              className="absolute left-1/2 top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-slate-900 transition-transform"
              style={{ transform: `translate(calc(-50% + ${pupilOffsetX}px), calc(-50% + ${pupilOffsetY}px))` }}
            />
          ) : null}
        </div>
      ))}
    </div>
  );
}

export function AnimatedCharactersLoginPage({ className }: { className?: string }) {
  const [pointer, setPointer] = useState({ x: 0.5, y: 0.5 });
  const [blinkA, setBlinkA] = useState(false);
  const [blinkB, setBlinkB] = useState(false);

  useEffect(() => {
    const onPointerMove = (event: PointerEvent) => {
      setPointer({
        x: event.clientX / window.innerWidth,
        y: event.clientY / window.innerHeight,
      });
    };

    window.addEventListener("pointermove", onPointerMove);
    return () => window.removeEventListener("pointermove", onPointerMove);
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => {
      setBlinkA(true);
      window.setTimeout(() => setBlinkA(false), 130);
    }, 2700);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => {
      setBlinkB(true);
      window.setTimeout(() => setBlinkB(false), 150);
    }, 3400);
    return () => window.clearInterval(id);
  }, []);

  const gaze = useMemo(
    () => ({
      x: (pointer.x - 0.5) * 8,
      y: (pointer.y - 0.5) * 6,
    }),
    [pointer]
  );

  return (
    <div
      className={cn(
        "relative min-h-[360px] overflow-hidden rounded-[2rem] border border-black/10 bg-[linear-gradient(145deg,#ffffff,#f5f5f5)] p-6",
        className
      )}
    >
      <div className="pointer-events-none absolute -left-28 -top-20 h-56 w-56 rounded-full bg-black/8 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 right-0 h-56 w-56 rounded-full bg-black/10 blur-3xl" />
      <div className="pointer-events-none absolute left-[8%] top-[10%] h-20 w-20 rounded-full bg-[radial-gradient(circle,rgba(0,212,255,0.45),rgba(0,212,255,0))] blur-xl float-fast" />
      <div className="pointer-events-none absolute right-[14%] top-[28%] h-24 w-24 rounded-full bg-[radial-gradient(circle,rgba(255,118,214,0.42),rgba(255,118,214,0))] blur-xl float-medium" />
      <div className="pointer-events-none absolute right-[28%] bottom-[18%] h-16 w-16 rounded-full bg-[radial-gradient(circle,rgba(113,255,180,0.42),rgba(113,255,180,0))] blur-lg float-slow" />

      <div className="relative flex h-full items-end justify-center gap-6">
        <div
          className="relative h-64 w-40 rounded-t-[4rem] border border-black/12 bg-[linear-gradient(180deg,#f9f9f9,#e8e8e8)] shadow-[0_16px_28px_rgba(0,0,0,0.18)] transition-transform duration-200"
          style={{ transform: `skewX(${(pointer.x - 0.5) * -4}deg)` }}
        >
          <div className="absolute left-1/2 top-12 -translate-x-1/2">
            <CharacterEyes pupilOffsetX={gaze.x} pupilOffsetY={gaze.y} blinking={blinkA} />
          </div>
        </div>

        <div
          className="relative h-80 w-44 rounded-t-[2rem] border border-black/12 bg-[linear-gradient(180deg,#3a3a3a,#121212)] shadow-[0_16px_28px_rgba(0,0,0,0.24)] transition-transform duration-200"
          style={{ transform: `skewX(${(pointer.x - 0.5) * 5}deg)` }}
        >
          <div className="absolute left-1/2 top-16 -translate-x-1/2">
            <CharacterEyes pupilOffsetX={gaze.x * 1.1} pupilOffsetY={gaze.y * 0.8} blinking={blinkB} />
          </div>
        </div>

        <div
          className="relative h-52 w-32 rounded-t-[3rem] border border-black/12 bg-[linear-gradient(180deg,#ffffff,#dedede)] shadow-[0_16px_28px_rgba(0,0,0,0.18)] transition-transform duration-200"
          style={{ transform: `skewX(${(pointer.x - 0.5) * -3}deg)` }}
        >
          <div className="absolute left-1/2 top-12 -translate-x-1/2">
            <CharacterEyes pupilOffsetX={gaze.x * 0.8} pupilOffsetY={gaze.y * 0.7} blinking={false} />
          </div>
        </div>
      </div>
    </div>
  );
}
