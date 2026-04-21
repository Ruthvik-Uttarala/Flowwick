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

    let rafId = 0;
    let frame = 0;
    const pointer = { x: 0.5, y: 0.5 };
    const comets = Array.from({ length: 7 }, (_, index) => ({
      speed: 0.0019 + index * 0.00024,
      phase: index * 0.63,
      band: 0.16 + index * 0.1,
      thickness: 1.1 + index * 0.14,
    }));

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
      backgroundGradient.addColorStop(0, "rgba(255,255,255,0.76)");
      backgroundGradient.addColorStop(0.48, "rgba(250,250,250,0.68)");
      backgroundGradient.addColorStop(1, "rgba(244,244,244,0.7)");
      context.fillStyle = backgroundGradient;
      context.fillRect(0, 0, width, height);

      const monochromeVignette = context.createRadialGradient(
        width * 0.55,
        height * 0.45,
        width * 0.08,
        width * 0.52,
        height * 0.5,
        width * 0.8
      );
      monochromeVignette.addColorStop(0, "rgba(255,255,255,0)");
      monochromeVignette.addColorStop(1, "rgba(0,0,0,0.16)");
      context.fillStyle = monochromeVignette;
      context.fillRect(0, 0, width, height);

      const pointerGlow = context.createRadialGradient(
        width * pointer.x,
        height * pointer.y,
        0,
        width * pointer.x,
        height * pointer.y,
        Math.max(width, height) * 0.25
      );
      pointerGlow.addColorStop(0, "rgba(0,0,0,0.08)");
      pointerGlow.addColorStop(1, "rgba(0,0,0,0)");
      context.fillStyle = pointerGlow;
      context.fillRect(0, 0, width, height);

      for (let index = 0; index < comets.length; index += 1) {
        const comet = comets[index];
        const t = frame * comet.speed + comet.phase;
        const centerX = (width * (t % 1)) - width * 0.2;
        const centerY =
          height * comet.band +
          Math.sin(t * 9 + pointer.x * 2.4 + index * 0.8) * (height * 0.07) +
          Math.cos(t * 4 + pointer.y * 2) * (height * 0.04);

        const tail = context.createLinearGradient(
          centerX - width * 0.35,
          centerY,
          centerX + width * 0.07,
          centerY
        );
        tail.addColorStop(0, "rgba(0,0,0,0)");
        tail.addColorStop(0.35, "rgba(0,212,255,0.16)");
        tail.addColorStop(0.68, "rgba(83,255,170,0.22)");
        tail.addColorStop(0.84, "rgba(255,207,92,0.24)");
        tail.addColorStop(1, "rgba(255,93,205,0.26)");

        context.strokeStyle = tail;
        context.lineWidth = comet.thickness;
        context.lineCap = "round";
        context.beginPath();
        context.moveTo(centerX - width * 0.35, centerY + Math.sin(t * 16) * 6);
        for (let step = 0; step <= 40; step += 1) {
          const x = centerX - width * 0.35 + (step / 40) * (width * 0.42);
          const y =
            centerY +
            Math.sin(step * 0.34 + t * 20 + index * 0.9) * (6 + index * 0.5) +
            Math.cos(step * 0.14 + t * 9) * 2.6;
          context.lineTo(x, y);
        }
        context.stroke();

        const head = context.createRadialGradient(centerX, centerY, 0, centerX, centerY, 18 + index * 1.5);
        head.addColorStop(0, "rgba(255,255,255,0.95)");
        head.addColorStop(0.3, "rgba(126,255,212,0.86)");
        head.addColorStop(0.62, "rgba(65,162,255,0.54)");
        head.addColorStop(1, "rgba(255,255,255,0)");
        context.fillStyle = head;
        context.beginPath();
        context.arc(centerX, centerY, 18 + index * 1.5, 0, Math.PI * 2);
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
