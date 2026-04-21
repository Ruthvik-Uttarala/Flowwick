"use client";

import { useRef } from "react";
import { motion, useScroll, useTransform } from "framer-motion";
import { cn } from "@/src/lib/cn";

const FLOW_STEPS = [
  {
    title: "Sign in",
    body: "Open your workspace and resume your launch queue.",
    impact: "One login, one flow",
  },
  {
    title: "Connect Shopify",
    body: "Authorize your store once and keep product identity stable.",
    impact: "No duplicate listings",
  },
  {
    title: "Connect Instagram",
    body: "Validate Meta linkage before you publish anything.",
    impact: "Fewer publish failures",
  },
  {
    title: "Upload details",
    body: "Drop images, title, description, quantity, and price in one place.",
    impact: "No repetitive data entry",
  },
  {
    title: "Enhance + launch",
    body: "Apply AI polish, then launch both channels from one action surface.",
    impact: "Hours saved each cycle",
  },
] as const;

interface SvgFollowScrollProps {
  className?: string;
}

export function SvgFollowScroll({ className }: SvgFollowScrollProps) {
  const sectionRef = useRef<HTMLDivElement | null>(null);
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start start", "end end"],
  });

  const pathLength = useTransform(scrollYProgress, [0, 1], [0.04, 1]);
  const barScale = useTransform(scrollYProgress, [0, 1], [0, 1]);

  return (
    <section
      ref={sectionRef}
      className={cn(
        "surface-shell relative h-[220vh] overflow-hidden rounded-[2rem] border border-black/12 p-5 sm:p-8",
        className
      )}
    >
      <div className="sticky top-20">
        <div className="mb-6 space-y-3">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-black/55">Flow story</p>
          <h2 className="text-3xl font-semibold tracking-tight text-black sm:text-4xl">
            A clean five-step launch path.
          </h2>
          <p className="max-w-3xl text-sm leading-7 text-black/65 sm:text-base">
            Scroll the sequence to see FlowCart compress manual listing work into one connected
            pipeline.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-[minmax(220px,280px)_1fr]">
          <div className="relative hidden min-h-[560px] lg:block">
            <svg
              viewBox="0 0 260 580"
              className="absolute inset-0 h-full w-full"
              role="presentation"
              aria-hidden="true"
            >
              <path
                d="M40 78 C130 78, 130 158, 220 158 C130 158, 130 238, 40 238 C130 238, 130 318, 220 318 C130 318, 130 398, 40 398 C130 398, 130 498, 220 498"
                stroke="rgba(0,0,0,0.22)"
                strokeWidth="10"
                strokeLinecap="round"
                fill="none"
              />
              <motion.path
                d="M40 78 C130 78, 130 158, 220 158 C130 158, 130 238, 40 238 C130 238, 130 318, 220 318 C130 318, 130 398, 40 398 C130 398, 130 498, 220 498"
                stroke="url(#flowcartProgress)"
                strokeWidth="10"
                strokeLinecap="round"
                fill="none"
                style={{ pathLength }}
              />
              {[
                [40, 78],
                [220, 158],
                [40, 238],
                [220, 318],
                [40, 398],
                [220, 498],
              ].map(([x, y]) => (
                <circle
                  key={`${x}-${y}`}
                  cx={x}
                  cy={y}
                  r="7"
                  fill="white"
                  stroke="rgba(0,0,0,0.25)"
                  strokeWidth="2"
                />
              ))}
              <defs>
                <linearGradient id="flowcartProgress" x1="40" y1="78" x2="220" y2="498" gradientUnits="userSpaceOnUse">
                  <stop offset="0" stopColor="#00d4ff" />
                  <stop offset="0.28" stopColor="#75f0ff" />
                  <stop offset="0.58" stopColor="#a794ff" />
                  <stop offset="1" stopColor="#4cc8ff" />
                </linearGradient>
              </defs>
            </svg>
          </div>

          <div className="space-y-4">
            <div className="relative h-1 overflow-hidden rounded-full bg-black/10">
              <motion.div
                className="h-full origin-left rounded-full bg-[linear-gradient(90deg,#00d4ff,#7ee7ff,#a894ff,#4fc9ff)]"
                style={{ scaleX: barScale }}
              />
            </div>

            {FLOW_STEPS.map((step, index) => (
              <motion.article
                key={step.title}
                initial={{ opacity: 0, y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.25 }}
                transition={{ duration: 0.35, delay: index * 0.05 }}
                className="rounded-2xl border border-black/12 bg-white/92 p-4 shadow-[0_8px_18px_rgba(0,0,0,0.06)]"
              >
                <div className="flex items-start gap-3">
                  <span className="story-number">{index + 1}</span>
                  <div>
                    <h3 className="text-base font-semibold text-black">{step.title}</h3>
                    <p className="mt-1 text-sm text-black/65">{step.body}</p>
                    <p className="mt-2 text-xs font-semibold uppercase tracking-wider text-black/55">
                      {step.impact}
                    </p>
                  </div>
                </div>
              </motion.article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
