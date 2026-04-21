"use client";

import { useRef } from "react";
import { motion, useScroll, useTransform } from "framer-motion";
import { cn } from "@/src/lib/cn";

const FLOW_STEPS = [
  {
    title: "Sign in",
    body: "Open FlowCart and load your launch workspace in seconds.",
    impact: "No setup maze",
  },
  {
    title: "Connect Shopify",
    body: "Authorize your store once so launches stay tied to one product source.",
    impact: "No duplicate products",
  },
  {
    title: "Connect Instagram",
    body: "Validate the Page-account path before publishing.",
    impact: "No failed publish surprises",
  },
  {
    title: "Upload details",
    body: "Drop product media, title, description, quantity, and price.",
    impact: "Minutes instead of manual tabs",
  },
  {
    title: "Enhance + launch",
    body: "Use AI polish, then GO to Shopify and Instagram in one flow.",
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

  const pathLength = useTransform(scrollYProgress, [0, 1], [0.02, 1]);
  const barScale = useTransform(scrollYProgress, [0, 1], [0, 1]);
  const cometY = useTransform(scrollYProgress, [0, 1], [80, 500]);

  return (
    <section
      ref={sectionRef}
      className={cn(
        "surface-shell relative h-[240vh] overflow-hidden rounded-[2rem] p-5 sm:p-8",
        className
      )}
    >
      <div className="sticky top-20">
        <div className="mb-6 space-y-3">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-black/55">Scroll story</p>
          <h2 className="text-3xl font-semibold tracking-tight text-black sm:text-4xl">
            One connected launch path.
          </h2>
          <p className="max-w-3xl text-sm leading-7 text-black/65 sm:text-base">
            Follow the exact five-step FlowCart sequence and watch the pipeline tighten as you move
            down the page.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
          <div className="relative hidden min-h-[560px] lg:block">
            <svg viewBox="0 0 220 580" className="absolute inset-0 h-full w-full" role="presentation" aria-hidden="true">
              <path
                d="M110 80 L110 500"
                stroke="rgba(0,0,0,0.22)"
                strokeWidth="10"
                strokeLinecap="round"
                fill="none"
              />
              <motion.path
                d="M110 80 L110 500"
                stroke="url(#flowCometRail)"
                strokeWidth="10"
                strokeLinecap="round"
                fill="none"
                style={{ pathLength }}
              />
              {[80, 185, 290, 395, 500].map((y) => (
                <circle key={y} cx="110" cy={y} r="7" fill="white" stroke="rgba(0,0,0,0.25)" strokeWidth="2" />
              ))}
              <defs>
                <linearGradient id="flowCometRail" x1="0" y1="80" x2="0" y2="500" gradientUnits="userSpaceOnUse">
                  <stop offset="0" stopColor="#00d4ff" />
                  <stop offset="0.34" stopColor="#5cffb3" />
                  <stop offset="0.66" stopColor="#ffd85a" />
                  <stop offset="1" stopColor="#ff6ad8" />
                </linearGradient>
              </defs>
            </svg>

            <motion.div
              style={{ y: cometY }}
              className="pointer-events-none absolute left-1/2 top-0 h-8 w-8 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(255,255,255,1)_0%,rgba(102,255,186,0.94)_35%,rgba(0,212,255,0.42)_65%,rgba(0,212,255,0)_100%)]"
            />
          </div>

          <div className="space-y-4">
            <div className="relative h-1 overflow-hidden rounded-full bg-black/10">
              <motion.div
                className="h-full origin-left rounded-full bg-[linear-gradient(90deg,#00d4ff,#66ffbd,#ffd96f,#ff6dd8)]"
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
                className="rounded-2xl border border-black/12 bg-white/90 p-4 shadow-[0_8px_18px_rgba(0,0,0,0.06)]"
              >
                <div className="flex items-start gap-3">
                  <span className="story-number">{index + 1}</span>
                  <div>
                    <h3 className="text-base font-semibold text-black">{step.title}</h3>
                    <p className="mt-1 text-sm text-black/65">{step.body}</p>
                    <p className="mt-2 text-xs font-semibold uppercase tracking-wider text-black/55">{step.impact}</p>
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
