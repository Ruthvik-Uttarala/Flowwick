"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/src/lib/cn";

interface WebGLShaderProps {
  className?: string;
}

const STROKE_COLORS = [
  "rgba(15, 108, 189, 0.26)",
  "rgba(76, 200, 255, 0.22)",
  "rgba(106, 84, 209, 0.2)",
  "rgba(15, 108, 189, 0.16)",
];

export function WebGLShader({ className }: WebGLShaderProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;

    let frame = 0;
    let rafId = 0;
    const pointer = { x: 0.5, y: 0.5 };

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
      canvas.width = Math.max(1, Math.floor(rect.width * dpr));
      canvas.height = Math.max(1, Math.floor(rect.height * dpr));
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const onPointerMove = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      pointer.x = (event.clientX - rect.left) / rect.width;
      pointer.y = (event.clientY - rect.top) / rect.height;
    };

    const drawFlowBand = (
      width: number,
      height: number,
      index: number,
      lineWidth: number
    ) => {
      const yBase = height * (0.2 + index * 0.17);
      const wave = 20 + index * 7 + pointer.y * 8;
      const speed = 0.009 + index * 0.0015;
      const drift = Math.sin(frame * speed + index * 0.8) * wave;

      context.beginPath();
      context.moveTo(-80, yBase + drift);
      for (let step = 0; step <= 7; step += 1) {
        const x = (step / 7) * width;
        const bend =
          Math.sin(step * 0.75 + frame * speed + pointer.x * 3 + index) * wave +
          Math.cos(step * 0.36 + frame * speed * 0.72) * wave * 0.4;
        context.lineTo(x, yBase + bend);
      }
      context.lineTo(width + 80, yBase + drift);
      context.strokeStyle = STROKE_COLORS[index % STROKE_COLORS.length];
      context.lineWidth = lineWidth;
      context.lineCap = "round";
      context.stroke();
    };

    const render = () => {
      frame += 1;
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      if (!width || !height) {
        rafId = window.requestAnimationFrame(render);
        return;
      }

      context.clearRect(0, 0, width, height);

      const baseGradient = context.createLinearGradient(0, 0, width, height);
      baseGradient.addColorStop(0, "rgba(255,255,255,0.86)");
      baseGradient.addColorStop(0.5, "rgba(247,251,255,0.78)");
      baseGradient.addColorStop(1, "rgba(243,248,255,0.84)");
      context.fillStyle = baseGradient;
      context.fillRect(0, 0, width, height);

      const vignette = context.createRadialGradient(
        width * 0.52,
        height * 0.48,
        width * 0.12,
        width * 0.52,
        height * 0.48,
        width * 0.78
      );
      vignette.addColorStop(0, "rgba(255,255,255,0)");
      vignette.addColorStop(1, "rgba(14,55,96,0.08)");
      context.fillStyle = vignette;
      context.fillRect(0, 0, width, height);

      drawFlowBand(width, height, 0, 18);
      drawFlowBand(width, height, 1, 13);
      drawFlowBand(width, height, 2, 10);
      drawFlowBand(width, height, 3, 7);

      rafId = window.requestAnimationFrame(render);
    };

    resize();
    window.addEventListener("resize", resize);
    window.addEventListener("pointermove", onPointerMove);
    rafId = window.requestAnimationFrame(render);

    return () => {
      window.cancelAnimationFrame(rafId);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onPointerMove);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className={cn("pointer-events-none absolute inset-0 h-full w-full", className)}
      aria-hidden="true"
    />
  );
}
