"use client";

import { useRef } from "react";
import { motion, useScroll, useTransform } from "framer-motion";
import { cn } from "@/src/lib/cn";

const FLOW_STEPS = [
  {
    title: "Sign in",
    body: "Open your workspace and continue the launch queue without losing context.",
    impact: "One login, one flow",
  },
  {
    title: "Connect Shopify",
    body: "Authorize once so product updates stay tied to one stable Shopify product.",
    impact: "No duplicate listings",
  },
  {
    title: "Connect Instagram",
    body: "Validate publishing credentials before launch to avoid noisy post failures.",
    impact: "Predictable publish path",
  },
  {
    title: "Upload product details",
    body: "Provide image, title, description, quantity, and price in one clean input surface.",
    impact: "No repetitive data entry",
  },
  {
    title: "Enhance and launch",
    body: "Apply AI polish and launch to Shopify + Instagram from one control point.",
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
    offset: ["start 85%", "end 30%"],
  });

  const barScale = useTransform(scrollYProgress, [0, 1], [0.02, 1]);

  return (
    <section
      ref={sectionRef}
      className={cn(
        "surface-shell relative overflow-hidden rounded-[2rem] p-5 sm:p-8",
        className
      )}
    >
      <div className="pointer-events-none absolute -right-16 top-1/3 h-64 w-64 rounded-full bg-[rgba(76,200,255,0.16)] blur-3xl" />
      <div className="pointer-events-none absolute -left-20 bottom-8 h-64 w-64 rounded-full bg-[rgba(106,84,209,0.12)] blur-3xl" />

      <div className="relative z-10 space-y-6">
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[color:rgba(19,26,34,0.56)]">
            Flow story
          </p>
          <h2 className="text-3xl font-semibold tracking-tight text-[color:var(--fc-text-primary)] sm:text-4xl">
            A polished five-step launch path.
          </h2>
          <p className="max-w-3xl text-sm leading-7 text-[color:var(--fc-text-muted)] sm:text-base">
            FlowCart compresses manual launch work into one connected, reliable sequence with clean sync feedback.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
          <div className="relative hidden lg:block">
            <div className="sticky top-24 min-h-[520px] rounded-2xl border border-[color:rgba(15,108,189,0.14)] bg-white/84 p-4">
              <div className="absolute left-8 top-8 bottom-8 w-[2px] rounded-full bg-[rgba(15,108,189,0.16)]" />
              <motion.div
                className="absolute left-8 top-8 bottom-8 w-[2px] origin-top rounded-full bg-[linear-gradient(180deg,#0f6cbd_0%,#4cc8ff_48%,#6a54d1_100%)]"
                style={{ scaleY: barScale }}
              />
              <ol className="relative z-10 space-y-6">
                {FLOW_STEPS.map((step, index) => (
                  <li key={step.title} className="flex items-start gap-3">
                    <span className="story-number mt-0.5">{index + 1}</span>
                    <div>
                      <p className="text-sm font-semibold text-[color:var(--fc-text-primary)]">{step.title}</p>
                      <p className="mt-0.5 text-xs text-[color:var(--fc-text-muted)]">{step.impact}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          </div>

          <div className="space-y-3">
            <div className="relative h-1 overflow-hidden rounded-full bg-[rgba(15,108,189,0.14)] lg:hidden">
              <motion.div
                className="h-full origin-left rounded-full bg-[linear-gradient(90deg,#0f6cbd,#4cc8ff,#6a54d1)]"
                style={{ scaleX: barScale }}
              />
            </div>

            {FLOW_STEPS.map((step, index) => (
              <motion.article
                key={step.title}
                initial={{ opacity: 0, y: 10 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.18 }}
                transition={{ duration: 0.34, delay: index * 0.04 }}
                className="rounded-2xl border border-[color:rgba(15,108,189,0.15)] bg-white/92 p-4 shadow-[0_10px_20px_rgba(22,62,112,0.08)]"
              >
                <div className="flex items-start gap-3">
                  <span className="story-number lg:hidden">{index + 1}</span>
                  <div>
                    <h3 className="text-base font-semibold text-[color:var(--fc-text-primary)]">{step.title}</h3>
                    <p className="mt-1 text-sm text-[color:var(--fc-text-muted)]">{step.body}</p>
                    <p className="mt-2 text-xs font-semibold uppercase tracking-wider text-[color:rgba(19,26,34,0.58)]">
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
