"use client";

import { useRef } from "react";
import { motion, useScroll, useTransform } from "framer-motion";
import { cn } from "@/src/lib/cn";

const FLOW_STEPS = [
  { title: "Sign in", body: "Open your FlowCart workspace in seconds." },
  { title: "Connect Shopify", body: "Authorize your store once and keep it linked." },
  { title: "Connect Instagram", body: "Validate your publishing pipeline before launch." },
  { title: "Upload product details", body: "Drop images, title, description, quantity, and price." },
  { title: "Enhance and launch", body: "Use AI polish, then GO to Shopify + Instagram together." },
] as const;

interface SvgFollowScrollProps {
  className?: string;
}

export function SvgFollowScroll({ className }: SvgFollowScrollProps) {
  const sectionRef = useRef<HTMLDivElement | null>(null);
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start center", "end center"],
  });

  const pathLength = useTransform(scrollYProgress, [0, 1], [0.12, 1]);
  const barScale = useTransform(scrollYProgress, [0, 1], [0, 1]);

  return (
    <section
      ref={sectionRef}
      className={cn(
        "relative overflow-hidden rounded-[2rem] border border-slate-200/70 bg-white/75 p-6 shadow-[0_20px_44px_rgba(15,23,42,0.08)] backdrop-blur-xl sm:p-8",
        className
      )}
    >
      <div className="mb-6 space-y-3">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
          Scroll Story
        </p>
        <h2 className="text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
          Upload once. Watch the launch flow accelerate.
        </h2>
        <p className="max-w-3xl text-sm leading-7 text-slate-600 sm:text-base">
          FlowCart removes repetitive listing work. As each step locks in, your path from raw
          product files to live storefront and social post gets faster and safer.
        </p>
      </div>

      <div className="relative grid gap-6 lg:grid-cols-[240px_1fr]">
        <div className="relative hidden min-h-[560px] items-center justify-center lg:flex">
          <svg
            viewBox="0 0 260 700"
            className="absolute h-full w-full"
            role="presentation"
            aria-hidden="true"
          >
            <path
              d="M126 18C84 72 210 118 140 188C74 254 198 310 129 386C62 461 193 520 121 602"
              stroke="rgba(148,163,184,0.35)"
              strokeWidth="14"
              strokeLinecap="round"
              fill="none"
            />
            <motion.path
              d="M126 18C84 72 210 118 140 188C74 254 198 310 129 386C62 461 193 520 121 602"
              stroke="url(#flowPathGradient)"
              strokeWidth="14"
              strokeLinecap="round"
              fill="none"
              style={{ pathLength }}
            />
            <defs>
              <linearGradient id="flowPathGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#22d3ee" />
                <stop offset="45%" stopColor="#34d399" />
                <stop offset="100%" stopColor="#f59e0b" />
              </linearGradient>
            </defs>
          </svg>
        </div>

        <div className="space-y-4">
          <div className="relative h-1 overflow-hidden rounded-full bg-slate-200">
            <motion.div
              className="h-full origin-left rounded-full bg-gradient-to-r from-cyan-400 via-emerald-400 to-amber-400"
              style={{ scaleX: barScale }}
            />
          </div>

          {FLOW_STEPS.map((step, index) => (
            <motion.article
              key={step.title}
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.2 }}
              transition={{ duration: 0.35, delay: index * 0.04 }}
              className="rounded-2xl border border-slate-200 bg-white/85 p-4 shadow-[0_8px_18px_rgba(15,23,42,0.06)]"
            >
              <div className="flex items-start gap-3">
                <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-cyan-200 bg-cyan-50 text-xs font-bold text-cyan-700">
                  {index + 1}
                </span>
                <div>
                  <h3 className="text-base font-semibold text-slate-900">{step.title}</h3>
                  <p className="mt-1 text-sm text-slate-600">{step.body}</p>
                </div>
              </div>
            </motion.article>
          ))}
        </div>
      </div>
    </section>
  );
}
