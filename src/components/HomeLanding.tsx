"use client";

import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, Sparkles, UploadCloud } from "lucide-react";
import { LiquidButton } from "@/src/components/ui/liquid-glass-button";
import { SvgFollowScroll } from "@/src/components/ui/svg-follow-scroll";
import { WebGLShader } from "@/src/components/ui/web-gl-shader";

const flowCards = [
  { label: "Product Media", delay: 0 },
  { label: "Shopify", delay: 0.12 },
  { label: "Instagram", delay: 0.24 },
];

export function HomeLanding() {
  return (
    <div className="w-full space-y-8 pb-6">
      <motion.section
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55 }}
        className="surface-shell relative overflow-hidden rounded-[2.4rem] border border-black/12 px-6 py-10 sm:px-10 sm:py-14"
      >
        <Image
          src="/brand/flowcart-background.png"
          alt="FlowCart launch flow background"
          fill
          priority
          className="object-cover object-center"
        />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(255,255,255,0.93)_0%,rgba(255,255,255,0.82)_44%,rgba(255,255,255,0.58)_70%,rgba(255,255,255,0.36)_100%)]" />
        <WebGLShader className="opacity-70 mix-blend-screen" />

        <div className="relative z-10 max-w-4xl space-y-5">
          <span className="mono-pill">
            <Sparkles size={12} /> FlowCart launch pipeline
          </span>

          <h1 className="text-5xl leading-[0.93] font-semibold tracking-tight text-black sm:text-6xl lg:text-7xl">
            Upload once.
            <br />
            Launch everywhere.
          </h1>

          <p className="max-w-2xl text-sm leading-7 text-black/70 sm:text-base">
            FlowCart moves one product draft through Shopify and Instagram in a single edit-safe
            flow, cutting repetitive listing work down to one pass.
          </p>

          <div className="flex flex-wrap items-center gap-3 pt-2">
            <LiquidButton asChild size="xl" className="min-w-44">
              <Link href="/dashboard">
                Open Dashboard <ArrowRight size={16} />
              </Link>
            </LiquidButton>
            <LiquidButton asChild variant="secondary" size="xl" className="min-w-36">
              <Link href="/auth">
                Sign in
              </Link>
            </LiquidButton>
          </div>

          <div className="flex flex-wrap gap-2 pt-1">
            <span className="mono-pill">No duplicate Shopify products</span>
            <span className="mono-pill">No duplicate Instagram posts</span>
            <span className="mono-pill">AI enhancement in flow</span>
          </div>
        </div>

        <div className="pointer-events-none absolute bottom-8 right-6 hidden w-[44%] max-w-[540px] flex-col gap-3 lg:flex">
          {flowCards.map((card) => (
            <motion.div
              key={card.label}
              initial={{ opacity: 0, x: 44 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.42, delay: 0.3 + card.delay }}
              className="rounded-full border border-black/15 bg-white/78 px-4 py-2.5 backdrop-blur"
            >
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-black/60">
                Flow step
              </p>
              <p className="mt-0.5 flex items-center gap-2 text-xs font-semibold text-black">
                <UploadCloud size={14} />
                {card.label}
              </p>
            </motion.div>
          ))}
        </div>
      </motion.section>

      <SvgFollowScroll />
    </div>
  );
}
