"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Sparkles, ShoppingBag, Instagram, ArrowRight, Zap } from "lucide-react";

const features = [
  {
    icon: Sparkles,
    title: "AI Enhancement",
    desc: "Airia-powered title and description enhancement for maximum conversion.",
    gradient: "from-purple-500 to-pink-500",
    glow: "rgba(168, 85, 247, 0.3)",
  },
  {
    icon: ShoppingBag,
    title: "Shopify Launch",
    desc: "One-click product creation with images, variants, and pricing.",
    gradient: "from-emerald-400 to-cyan-400",
    glow: "rgba(52, 211, 153, 0.3)",
  },
  {
    icon: Instagram,
    title: "Instagram Auto-Post",
    desc: "Publish stunning product posts with captions and shop links.",
    gradient: "from-pink-500 to-orange-400",
    glow: "rgba(236, 72, 153, 0.3)",
  },
];

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

export default function Home() {
  return (
    <div className="w-full space-y-12">
      {/* Floating orbs */}
      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
        <div className="float-slow absolute top-[15%] left-[10%] h-72 w-72 rounded-full bg-purple-500/[0.06] blur-[80px]" />
        <div className="float-medium absolute top-[60%] right-[15%] h-96 w-96 rounded-full bg-cyan-500/[0.05] blur-[100px]" />
        <div className="float-fast absolute top-[30%] right-[30%] h-48 w-48 rounded-full bg-pink-500/[0.04] blur-[60px]" />
      </div>

      {/* Hero */}
      <motion.section
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7 }}
        className="relative overflow-hidden rounded-[2rem] border border-white/[0.08] bg-white/[0.03] p-10 sm:p-14 backdrop-blur-2xl"
      >
        <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/[0.05] via-transparent to-purple-500/[0.05]" />

        <div className="relative z-10">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.2, duration: 0.5 }}
            className="flex flex-wrap items-center gap-3 mb-6"
          >
            <span className="flex items-center gap-1.5 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-400">
              <Zap size={12} /> FlowCart
            </span>
            <span className="rounded-full border border-purple-400/20 bg-purple-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-purple-400">
              Live Integrations
            </span>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.6 }}
            className="max-w-3xl text-5xl sm:text-6xl font-extrabold tracking-tight"
          >
            <span className="gradient-text">Upload once.</span>
            <br />
            <span className="text-white">Launch everywhere.</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.45, duration: 0.6 }}
            className="mt-5 max-w-2xl text-base leading-8 text-white/50"
          >
            FlowCart is a launch cockpit for sellers who need one clean path from
            product idea to live storefront and social post, powered by Airia AI,
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
              className="btn-gradient inline-flex items-center gap-2 rounded-2xl px-6 py-3.5 text-sm font-semibold shadow-lg"
            >
              <span className="flex items-center gap-2">
                Get Started <ArrowRight size={16} />
              </span>
            </Link>
            <Link
              href="/auth"
              className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-6 py-3.5 text-sm font-semibold text-white/70 backdrop-blur-sm transition hover:bg-white/[0.08] hover:text-white"
            >
              Sign In
            </Link>
          </motion.div>
        </div>
      </motion.section>

      {/* Feature Cards */}
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
              className="glass-card glass-card-hover group rounded-2xl p-6 cursor-default"
            >
              <div
                className={`mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br ${feature.gradient}`}
                style={{ boxShadow: `0 4px 20px ${feature.glow}` }}
              >
                <Icon size={22} className="text-white" />
              </div>
              <h3 className="text-lg font-semibold text-white">{feature.title}</h3>
              <p className="mt-2 text-sm leading-6 text-white/40">{feature.desc}</p>
            </motion.div>
          );
        })}
      </motion.section>

      {/* How It Works */}
      <motion.section
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5, duration: 0.6 }}
        className="glass-card rounded-[2rem] p-8"
      >
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/30">
          How It Works
        </p>
        <div className="mt-5 grid gap-3 sm:grid-cols-5">
          {[
            { step: "Sign Up", desc: "Create your account" },
            { step: "Connect", desc: "Save API credentials" },
            { step: "Upload", desc: "Add product images" },
            { step: "Enhance", desc: "AI-optimize content" },
            { step: "Launch", desc: "Go live everywhere" },
          ].map((s, index) => (
            <motion.div
              key={s.step}
              whileHover={{ y: -3 }}
              className="relative rounded-xl border border-white/[0.06] bg-white/[0.03] px-4 py-4 text-center transition hover:border-white/[0.12] hover:bg-white/[0.06]"
            >
              <span className="text-2xl font-bold gradient-text">{index + 1}</span>
              <p className="mt-1 text-sm font-semibold text-white">{s.step}</p>
              <p className="mt-1 text-xs text-white/30">{s.desc}</p>
            </motion.div>
          ))}
        </div>
      </motion.section>
    </div>
  );
}
