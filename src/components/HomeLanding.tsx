"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, Camera, Sparkles, UploadCloud, Wand2 } from "lucide-react";
import { LiquidButton } from "@/src/components/ui/liquid-glass-button";
import { SvgFollowScroll } from "@/src/components/ui/svg-follow-scroll";
import { WebGLShader } from "@/src/components/ui/web-gl-shader";

const storyMoments = [
  {
    title: "Upload Once",
    icon: UploadCloud,
    stat: "1 source of truth",
  },
  {
    title: "Flow to Shopify + Instagram",
    icon: Camera,
    stat: "2 launch channels",
  },
  {
    title: "Enhance, then Launch",
    icon: Wand2,
    stat: "Hours saved weekly",
  },
  {
    title: "No Duplicate Publishing",
    icon: Sparkles,
    stat: "0 silent duplicates",
  },
] as const;

export function HomeLanding() {
  return (
    <div className="w-full space-y-8 pb-6">
      <motion.section
        initial={{ opacity: 0, y: 26 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55 }}
        className="surface-shell relative overflow-hidden rounded-[2.4rem] px-6 py-10 sm:px-10 sm:py-14"
      >
        <WebGLShader className="opacity-95" />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_15%,rgba(255,255,255,0.85),rgba(255,255,255,0)_50%)]" />

        <div className="relative z-10 max-w-5xl space-y-5">
          <span className="mono-pill">
            <Sparkles size={12} /> FlowCart launch story
          </span>

          <h1 className="text-5xl leading-[0.93] font-semibold tracking-tight text-black sm:text-6xl lg:text-7xl">
            Upload once.
            <br />
            <span className="text-black/78">Launch across Shopify and Instagram.</span>
          </h1>

          <p className="max-w-2xl text-sm leading-7 text-black/65 sm:text-base">
            A cinematic launch pipeline for merchants: product media in once, AI enhancement in one
            place, clean publishing out to both channels without repetitive listing work.
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

        <motion.div
          initial={{ opacity: 0.4, x: -36 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 1.1 }}
          className="pointer-events-none absolute bottom-8 left-8 right-8 h-14 overflow-hidden rounded-full border border-black/12 bg-white/55 backdrop-blur"
        >
          <motion.div
            animate={{ x: ["-20%", "125%"] }}
            transition={{ duration: 2.8, repeat: Number.POSITIVE_INFINITY, ease: "linear" }}
            className="absolute top-1/2 h-8 w-36 -translate-y-1/2 rounded-full bg-[linear-gradient(90deg,rgba(0,212,255,0),rgba(0,212,255,0.45),rgba(104,255,188,0.48),rgba(255,214,94,0.42),rgba(255,90,212,0.42),rgba(0,212,255,0))] blur-[1px]"
          />
          <div className="absolute inset-0 bg-[repeating-linear-gradient(90deg,rgba(0,0,0,0.22)_0_1px,transparent_1px_26px)] opacity-25" />
        </motion.div>
      </motion.section>

      <motion.section
        initial={{ opacity: 0, y: 22 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.25 }}
        transition={{ duration: 0.45 }}
        className="surface-shell overflow-hidden rounded-[1.9rem] p-6 sm:p-8"
      >
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-2xl font-semibold tracking-tight text-black sm:text-3xl">
            Don&apos;t read blocks. Watch the flow.
          </h2>
          <span className="mono-pill">From upload to launch</span>
        </div>

        <div className="relative grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="pointer-events-none absolute left-0 right-0 top-[2.2rem] hidden h-[2px] bg-black/10 lg:block" />
          {storyMoments.map((item, index) => {
            const Icon = item.icon;
            return (
              <motion.article
                key={item.title}
                initial={{ opacity: 0, y: 14 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.4 }}
                transition={{ duration: 0.3, delay: index * 0.05 }}
                className="relative space-y-2"
              >
                <div className="relative z-10 inline-flex items-center gap-2 rounded-full border border-black/15 bg-white px-3 py-2 text-xs font-semibold text-black shadow-[0_8px_14px_rgba(0,0,0,0.08)]">
                  <span className="story-number">{index + 1}</span>
                  <Icon size={15} />
                </div>
                <h3 className="text-sm font-semibold text-black">{item.title}</h3>
                <p className="text-xs tracking-wide text-black/55">{item.stat}</p>
              </motion.article>
            );
          })}
        </div>
      </motion.section>

      <SvgFollowScroll />
    </div>
  );
}
