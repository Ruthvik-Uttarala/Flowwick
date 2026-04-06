"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Sparkles, ShoppingBag, Camera, ArrowRight, Zap } from "lucide-react";

const features = [
  {
    icon: Sparkles,
    title: "AI Enhancement",
    desc: "GPT-powered title and description enhancement for maximum conversion.",
    color: "text-[#C47A2C]",
    bg: "bg-[#C47A2C]/10",
    border: "border-[#C47A2C]/20",
  },
  {
    icon: ShoppingBag,
    title: "Shopify Launch",
    desc: "One-click product creation with images, variants, and pricing.",
    color: "text-[#A86420]",
    bg: "bg-[#A86420]/10",
    border: "border-[#A86420]/20",
  },
  {
    icon: Camera,
    title: "Instagram Auto-Post",
    desc: "Publish stunning product posts with captions and shop links.",
    color: "text-[#D4943F]",
    bg: "bg-[#D4943F]/10",
    border: "border-[#D4943F]/20",
  },
] as const;

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.12, delayChildren: 0.3 },
  },
};

const item = {
  hidden: { opacity: 0, y: 30 },
  show: { opacity: 1, y: 0, transition: { duration: 0.6 } },
};

export function HomeLanding() {
  return (
    <div className="w-full space-y-12">
      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
        <div className="float-slow absolute top-[15%] left-[10%] h-72 w-72 rounded-full bg-[#C47A2C]/[0.04] blur-[80px]" />
        <div className="float-medium absolute top-[60%] right-[15%] h-96 w-96 rounded-full bg-[#D4943F]/[0.03] blur-[100px]" />
        <div className="float-fast absolute top-[30%] right-[30%] h-48 w-48 rounded-full bg-[#A86420]/[0.03] blur-[60px]" />
      </div>

      <motion.section
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7 }}
        className="relative overflow-hidden rounded-[2rem] border border-[#2B1B12]/[0.08] bg-white/60 p-10 sm:p-14 backdrop-blur-2xl"
      >
        <div className="absolute inset-0 bg-gradient-to-br from-[#C47A2C]/[0.04] via-transparent to-[#D4943F]/[0.03]" />

        <div className="relative z-10">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.2, duration: 0.5 }}
            className="mb-6 flex flex-wrap items-center gap-3"
          >
            <span className="flex items-center gap-1.5 rounded-full border border-[#C47A2C]/20 bg-[#C47A2C]/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-[#C47A2C]">
              <Zap size={12} /> FlowCart
            </span>
            <span className="rounded-full border border-[#2B1B12]/10 bg-[#2B1B12]/5 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-[#2B1B12]/50">
              Live Integrations
            </span>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.6 }}
            className="max-w-3xl text-5xl font-extrabold tracking-tight sm:text-6xl"
          >
            <span className="gradient-text-warm">Upload once.</span>
            <br />
            <span className="text-[#2B1B12]">Launch everywhere.</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.45, duration: 0.6 }}
            className="mt-5 max-w-2xl text-base leading-8 text-[#2B1B12]/50"
          >
            FlowCart is a launch cockpit for sellers who need one clean path from
            product idea to live storefront and social post, powered by AI,
            Shopify, Instagram, and Supabase.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6, duration: 0.6 }}
            className="mt-8 flex flex-wrap gap-4"
          >
            <Link
              href="/dashboard"
              className="btn-warm inline-flex items-center gap-2 rounded-2xl px-6 py-3.5 text-sm font-semibold shadow-lg"
            >
              <span className="flex items-center gap-2">
                Get Started <ArrowRight size={16} />
              </span>
            </Link>
            <Link
              href="/auth"
              className="inline-flex items-center gap-2 rounded-2xl border border-[#2B1B12]/10 bg-white/60 px-6 py-3.5 text-sm font-semibold text-[#2B1B12]/70 transition hover:bg-white/80 hover:text-[#2B1B12]"
            >
              Sign In
            </Link>
          </motion.div>
        </div>
      </motion.section>

      <motion.section
        variants={container}
        initial="hidden"
        animate="show"
        className="grid gap-5 sm:grid-cols-3"
      >
        {features.map((feature) => {
          const Icon = feature.icon;
          return (
            <motion.div
              key={feature.title}
              variants={item}
              whileHover={{ y: -6, scale: 1.02 }}
              transition={{ type: "spring", stiffness: 300, damping: 20 }}
              className="warm-card warm-card-hover group cursor-default rounded-2xl p-6"
            >
              <div
                className={`mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl ${feature.bg} border ${feature.border}`}
              >
                <Icon size={22} className={feature.color} />
              </div>
              <h3 className="text-lg font-semibold text-[#2B1B12]">{feature.title}</h3>
              <p className="mt-2 text-sm leading-6 text-[#2B1B12]/45">{feature.desc}</p>
            </motion.div>
          );
        })}
      </motion.section>

      <motion.section
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5, duration: 0.6 }}
        className="warm-card rounded-[2rem] p-8"
      >
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#2B1B12]/30">
          How It Works
        </p>
        <div className="mt-5 grid gap-3 sm:grid-cols-5">
          {[
            { step: "Sign Up", desc: "Create your account" },
            { step: "Connect", desc: "Link Shopify via OAuth" },
            { step: "Upload", desc: "Add product images" },
            { step: "Enhance", desc: "AI-optimize content" },
            { step: "Launch", desc: "Go live everywhere" },
          ].map((entry, index) => (
            <motion.div
              key={entry.step}
              whileHover={{ y: -3 }}
              className="relative rounded-xl border border-[#2B1B12]/[0.06] bg-white/50 px-4 py-4 text-center transition hover:border-[#C47A2C]/20 hover:bg-white/70"
            >
              <span className="text-2xl font-bold gradient-text-warm">{index + 1}</span>
              <p className="mt-1 text-sm font-semibold text-[#2B1B12]">{entry.step}</p>
              <p className="mt-1 text-xs text-[#2B1B12]/35">{entry.desc}</p>
            </motion.div>
          ))}
        </div>
      </motion.section>
    </div>
  );
}
