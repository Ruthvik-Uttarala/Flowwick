"use client";

import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, CheckCircle2, Sparkles, UploadCloud } from "lucide-react";
import { LiquidButton } from "@/src/components/ui/liquid-glass-button";
import { SvgFollowScroll } from "@/src/components/ui/svg-follow-scroll";

const flowCards = [
  { label: "Upload product media", detail: "One source of truth" },
  { label: "Sync Shopify product", detail: "No duplicate listings" },
  { label: "Update Instagram post", detail: "Same post, edit-safe" },
];

export function HomeLanding() {
  return (
    <div className="w-full space-y-8 pb-6">
      <motion.section
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55 }}
        className="surface-shell relative overflow-hidden rounded-[2.4rem] px-6 py-9 sm:px-10 sm:py-12"
      >
        <Image
          src="/brand/flowcart-background.png"
          alt="FlowCart launch flow background"
          fill
          priority
          className="object-cover object-center"
        />
        <div className="absolute inset-0 bg-[linear-gradient(108deg,rgba(250,252,255,0.96)_0%,rgba(248,252,255,0.88)_46%,rgba(244,248,255,0.54)_70%,rgba(239,246,255,0.38)_100%)]" />

        <div className="pointer-events-none absolute -top-20 -right-16 h-72 w-72 rounded-full bg-[rgba(76,200,255,0.2)] blur-3xl" />
        <div className="pointer-events-none absolute -bottom-20 -left-12 h-72 w-72 rounded-full bg-[rgba(106,84,209,0.12)] blur-3xl" />

        <div className="relative z-10 grid gap-7 lg:grid-cols-[1.15fr_0.85fr] lg:items-end">
          <div className="max-w-3xl space-y-5">
            <span className="mono-pill">
              <Sparkles size={12} /> FlowCart launch pipeline
            </span>

            <div className="space-y-3">
              <h1 className="text-4xl leading-[0.95] font-semibold tracking-tight text-[color:var(--fc-text-primary)] sm:text-5xl lg:text-6xl">
                Upload once.
                <br />
                Launch everywhere.
              </h1>
              <p className="max-w-2xl text-sm leading-7 text-[color:var(--fc-text-muted)] sm:text-base">
                FlowCart turns one product draft into a clean, connected Shopify and Instagram launch flow with in-place updates and zero duplicate-post chaos.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3 pt-1">
              <LiquidButton asChild size="xl" className="min-w-44">
                <Link href="/dashboard">
                  Open Dashboard <ArrowRight size={16} />
                </Link>
              </LiquidButton>
              <LiquidButton asChild variant="secondary" size="xl" className="min-w-36">
                <Link href="/auth">Sign in</Link>
              </LiquidButton>
            </div>

            <div className="grid gap-2 pt-1 sm:grid-cols-3">
              <span className="mono-pill justify-center sm:justify-start">No duplicate Shopify products</span>
              <span className="mono-pill justify-center sm:justify-start">No duplicate Instagram posts</span>
              <span className="mono-pill justify-center sm:justify-start">AI enhancement in flow</span>
            </div>
          </div>

          <div className="rounded-[1.6rem] border border-[color:rgba(15,108,189,0.2)] bg-white/88 p-4 shadow-[0_18px_36px_rgba(22,62,112,0.14)] backdrop-blur-sm">
            <div className="mb-3 flex items-center gap-3">
              <div className="inline-flex h-10 w-10 items-center justify-center overflow-hidden rounded-xl border border-[color:rgba(15,108,189,0.2)] bg-white">
                <Image
                  src="/brand/flowcart-logo-clean.png"
                  alt="FlowCart logo"
                  width={52}
                  height={52}
                  className="h-full w-full object-contain p-1"
                />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[color:rgba(19,26,34,0.56)]">
                  Launch Journey
                </p>
                <p className="text-sm font-semibold text-[color:var(--fc-text-primary)]">One product, multi-channel outcome</p>
              </div>
            </div>

            <div className="space-y-2.5">
              {flowCards.map((card, index) => (
                <motion.div
                  key={card.label}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.34, delay: 0.12 + index * 0.08 }}
                  className="rounded-xl border border-[color:rgba(15,108,189,0.16)] bg-white/92 px-3 py-2.5"
                >
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[color:rgba(19,26,34,0.52)]">
                    Step {index + 1}
                  </p>
                  <p className="mt-0.5 flex items-center gap-2 text-sm font-semibold text-[color:var(--fc-text-primary)]">
                    <UploadCloud size={14} className="text-[color:var(--fc-primary)]" />
                    {card.label}
                  </p>
                  <p className="mt-1 text-xs text-[color:var(--fc-text-muted)]">{card.detail}</p>
                </motion.div>
              ))}
            </div>

            <div className="mt-3 flex items-center gap-2 rounded-xl border border-[color:rgba(18,122,89,0.24)] bg-[rgba(18,122,89,0.1)] px-3 py-2 text-xs font-semibold text-[color:#0c5e45]">
              <CheckCircle2 size={13} /> Ready for clean, edit-safe launches
            </div>
          </div>
        </div>
      </motion.section>

      <SvgFollowScroll />
    </div>
  );
}
