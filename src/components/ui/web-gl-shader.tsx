"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/src/lib/cn";

interface WebGLShaderProps {
  className?: string;
}

export function WebGLShader({ className }: WebGLShaderProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }

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
      if (!rect.width || !rect.height) {
        return;
      }
      pointer.x = (event.clientX - rect.left) / rect.width;
      pointer.y = (event.clientY - rect.top) / rect.height;
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

      const backgroundGradient = context.createLinearGradient(0, 0, width, height);
      backgroundGradient.addColorStop(0, "#fffdf6");
      backgroundGradient.addColorStop(0.55, "#f4f8ff");
      backgroundGradient.addColorStop(1, "#f5f1e5");
      context.fillStyle = backgroundGradient;
      context.fillRect(0, 0, width, height);

      const pulseX = width * pointer.x;
      const pulseY = height * pointer.y;
      const pulseRadius = Math.max(width, height) * 0.48;
      const glow = context.createRadialGradient(pulseX, pulseY, 0, pulseX, pulseY, pulseRadius);
      glow.addColorStop(0, "rgba(34,211,238,0.22)");
      glow.addColorStop(0.35, "rgba(250,204,21,0.14)");
      glow.addColorStop(1, "rgba(255,255,255,0)");
      context.fillStyle = glow;
      context.fillRect(0, 0, width, height);

      for (let index = 0; index < 6; index += 1) {
        const t = frame * 0.015 + index * 0.85;
        const bandY = (Math.sin(t) * 0.18 + 0.5) * height;
        const bandHeight = height * (0.08 + index * 0.015);
        const alpha = 0.09 - index * 0.01;
        const wave = context.createLinearGradient(0, bandY - bandHeight, width, bandY + bandHeight);
        wave.addColorStop(0, `rgba(16,185,129,${Math.max(alpha - 0.02, 0.02)})`);
        wave.addColorStop(0.5, `rgba(14,165,233,${Math.max(alpha, 0.03)})`);
        wave.addColorStop(1, `rgba(245,158,11,${Math.max(alpha - 0.03, 0.02)})`);

        context.fillStyle = wave;
        context.beginPath();
        context.moveTo(0, bandY);

        const segments = 36;
        for (let segment = 0; segment <= segments; segment += 1) {
          const x = (segment / segments) * width;
          const y =
            bandY +
            Math.sin(segment * 0.65 + frame * 0.02 + index) * bandHeight * 0.35 +
            Math.cos(segment * 0.25 + frame * 0.012 + pointer.x * 2) * bandHeight * 0.2;
          context.lineTo(x, y);
        }

        context.lineTo(width, bandY + bandHeight * 1.2);
        context.lineTo(0, bandY + bandHeight * 1.2);
        context.closePath();
        context.fill();
      }

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
