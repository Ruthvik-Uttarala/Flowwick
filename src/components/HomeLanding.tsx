"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, Camera, Sparkles, UploadCloud } from "lucide-react";
import { LiquidButton } from "@/src/components/ui/liquid-glass-button";
import { SvgFollowScroll } from "@/src/components/ui/svg-follow-scroll";
import { WebGLShader } from "@/src/components/ui/web-gl-shader";

const highlights = [
  {
    title: "One upload source",
    body: "Drop product media and details once, then FlowCart handles channel-safe formatting.",
    icon: UploadCloud,
  },
  {
    title: "Shopify + Instagram in sync",
    body: "Keep launch state and links aligned without duplicate products or duplicate posts.",
    icon: Camera,
  },
  {
    title: "AI that accelerates edits",
    body: "Enhance title and description in-context, then launch with a single GO decision.",
    icon: Sparkles,
  },
] as const;

export function HomeLanding() {
  return (
    <div className="w-full space-y-10 pb-6">
      <motion.section
        initial={{ opacity: 0, y: 26 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55 }}
        className="relative overflow-hidden rounded-[2.4rem] border border-slate-200/80 bg-white/72 px-6 py-10 shadow-[0_28px_56px_rgba(15,23,42,0.12)] sm:px-10 sm:py-14"
      >
        <WebGLShader className="opacity-80" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(255,255,255,0.48),rgba(255,255,255,0)_52%)]" />

        <div className="relative z-10 max-w-4xl space-y-5">
          <span className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-white/80 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.2em] text-sky-700">
            <Sparkles size={12} /> FlowCart launch story
          </span>

          <h1 className="text-5xl leading-[0.95] font-semibold tracking-tight text-slate-900 sm:text-6xl lg:text-7xl">
            Upload once.
            <br />
            <span className="gradient-text-warm">Launch across Shopify and Instagram.</span>
          </h1>

          <p className="max-w-2xl text-sm leading-7 text-slate-600 sm:text-base">
            FlowCart turns repetitive listing work into one connected pipeline. Add product details,
            enhance with AI, and push a clean launch flow that saves hours every cycle.
          </p>

          <div className="flex flex-wrap items-center gap-3 pt-2">
            <Link href="/dashboard">
              <LiquidButton size="xl" className="min-w-44">
                Open Dashboard <ArrowRight size={16} />
              </LiquidButton>
            </Link>
            <Link href="/auth">
              <LiquidButton variant="secondary" size="xl" className="min-w-32">
                Sign in
              </LiquidButton>
            </Link>
          </div>
        </div>
      </motion.section>

      <motion.section
        initial={{ opacity: 0, y: 22 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.25 }}
        transition={{ duration: 0.45 }}
        className="grid gap-4 md:grid-cols-3"
      >
        {highlights.map((item, index) => {
          const Icon = item.icon;
          return (
            <motion.article
              key={item.title}
              initial={{ opacity: 0, y: 14 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.4 }}
              transition={{ duration: 0.3, delay: index * 0.04 }}
              className="warm-card warm-card-hover rounded-3xl p-5"
            >
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-cyan-200 bg-cyan-50 text-cyan-700">
                <Icon size={18} />
              </span>
              <h2 className="mt-4 text-lg font-semibold text-slate-900">{item.title}</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">{item.body}</p>
            </motion.article>
          );
        })}
      </motion.section>

      <SvgFollowScroll />
    </div>
  );
}
