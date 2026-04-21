"use client";

import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, Check, Sparkles, ShoppingBag, Camera, Upload, Wand2, LogIn } from "lucide-react";

const TRUST_POINTS = [
  { icon: ShoppingBag, label: "No duplicate Shopify products" },
  { icon: Camera, label: "No duplicate Instagram posts" },
  { icon: Wand2, label: "AI enhancement in flow" },
];

const FLOW_STEPS = [
  {
    number: 1,
    title: "Sign in",
    description: "Open your workspace and resume your launch queue.",
    icon: LogIn,
  },
  {
    number: 2,
    title: "Connect Shopify",
    description: "Authorize your store once and keep product identity stable.",
    icon: ShoppingBag,
  },
  {
    number: 3,
    title: "Connect Instagram",
    description: "Validate Meta linkage before you publish anything.",
    icon: Camera,
  },
  {
    number: 4,
    title: "Upload details",
    description: "Drop images, title, description, quantity, and price in one place.",
    icon: Upload,
  },
  {
    number: 5,
    title: "Enhance and launch",
    description: "Apply AI polish, then launch both channels from one action.",
    icon: Wand2,
  },
];

const VALUE_POINTS = [
  "One upload serves Shopify and Instagram",
  "Edit-safe drafts prevent accidental duplicates",
  "AI enhancement refines titles and descriptions",
  "Real-time sync across platforms",
];

export function HomeLanding() {
  return (
    <div className="w-full space-y-20 pb-16">
      {/* Hero Section */}
      <motion.section
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="relative overflow-hidden rounded-2xl"
      >
        {/* Background with gradient atmosphere */}
        <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-[#0F6CBD]/[0.04] via-[#4CC8FF]/[0.03] to-[#6A54D1]/[0.04]" />
        <div className="absolute inset-0 rounded-2xl">
          <Image
            src="/brand/flowcart-background.png"
            alt=""
            fill
            priority
            className="object-cover object-center opacity-[0.08]"
          />
        </div>
        
        <div className="relative px-6 py-16 sm:px-12 sm:py-24 lg:px-16 lg:py-28">
          <div className="mx-auto max-w-3xl text-center">
            {/* Label pill */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.1 }}
              className="mb-6 inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface)] px-4 py-2 shadow-sm"
            >
              <Sparkles size={14} className="text-[var(--primary)]" />
              <span className="text-sm font-medium text-[var(--foreground)]">
                FlowCart launch pipeline
              </span>
            </motion.div>

            {/* Main heading */}
            <motion.h1
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.15 }}
              className="text-balance text-4xl font-semibold leading-[1.1] tracking-[-0.03em] text-[var(--foreground)] sm:text-5xl lg:text-6xl"
            >
              Upload once.
              <br />
              Launch everywhere.
            </motion.h1>

            {/* Supporting text */}
            <motion.p
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.25 }}
              className="mx-auto mt-6 max-w-xl text-pretty text-base leading-relaxed text-[var(--muted-foreground)] sm:text-lg"
            >
              Move one product draft through Shopify and Instagram in one clean edit-safe flow.
            </motion.p>

            {/* CTA buttons */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.35 }}
              className="mt-10 flex flex-wrap items-center justify-center gap-4"
            >
              <Link
                href="/dashboard"
                className="btn-primary group"
              >
                Open Dashboard
                <ArrowRight size={16} className="transition-transform group-hover:translate-x-0.5" />
              </Link>
              <Link
                href="/auth"
                className="btn-secondary"
              >
                Sign in
              </Link>
            </motion.div>
          </div>
        </div>
      </motion.section>

      {/* Trust / Proof Strip */}
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.3 }}
        transition={{ duration: 0.5 }}
        className="flex flex-wrap items-center justify-center gap-4"
      >
        {TRUST_POINTS.map((point, index) => (
          <motion.div
            key={point.label}
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4, delay: index * 0.1 }}
            className="trust-pill"
          >
            <point.icon size={16} className="text-[var(--primary)]" />
            <span>{point.label}</span>
          </motion.div>
        ))}
      </motion.section>

      {/* Five-Step Launch Flow */}
      <motion.section
        initial={{ opacity: 0, y: 16 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.2 }}
        transition={{ duration: 0.5 }}
        className="px-1"
      >
        <div className="mb-10 text-center">
          <span className="label-pill mb-4 inline-flex">Launch Flow</span>
          <h2 className="text-balance text-2xl font-semibold tracking-[-0.02em] text-[var(--foreground)] sm:text-3xl lg:text-4xl">
            A clean five-step launch path
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-pretty text-[var(--muted-foreground)]">
            FlowCart compresses manual listing work into one connected pipeline.
          </p>
        </div>

        {/* Steps grid */}
        <div className="relative mx-auto max-w-4xl">
          {/* Connecting line for desktop */}
          <div className="absolute left-1/2 top-8 hidden h-[calc(100%-4rem)] w-0.5 -translate-x-1/2 bg-gradient-to-b from-[var(--primary)] via-[var(--secondary)] to-[var(--primary)]/30 lg:block" />
          
          <div className="space-y-4 lg:space-y-0">
            {FLOW_STEPS.map((step, index) => (
              <motion.div
                key={step.number}
                initial={{ opacity: 0, y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.4 }}
                transition={{ duration: 0.4, delay: index * 0.08 }}
                className={`relative lg:flex lg:items-center lg:gap-8 ${
                  index % 2 === 0 ? "lg:flex-row" : "lg:flex-row-reverse"
                }`}
              >
                {/* Card */}
                <div className={`card-surface-elevated p-5 lg:w-[calc(50%-2rem)] ${
                  index % 2 === 0 ? "lg:mr-auto" : "lg:ml-auto"
                }`}>
                  <div className="flex items-start gap-4">
                    <div className="step-number">{step.number}</div>
                    <div className="flex-1">
                      <div className="mb-2 flex items-center gap-2">
                        <step.icon size={16} className="text-[var(--secondary)]" />
                        <h3 className="text-base font-semibold text-[var(--foreground)]">
                          {step.title}
                        </h3>
                      </div>
                      <p className="text-sm leading-relaxed text-[var(--muted-foreground)]">
                        {step.description}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Center dot for desktop */}
                <div className="absolute left-1/2 top-1/2 hidden h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[var(--surface)] bg-[var(--primary)] shadow-sm lg:block" />
              </motion.div>
            ))}
          </div>
        </div>
      </motion.section>

      {/* Product Value Section */}
      <motion.section
        initial={{ opacity: 0, y: 16 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.3 }}
        transition={{ duration: 0.5 }}
        className="card-surface-elevated mx-auto max-w-3xl p-8 sm:p-10 lg:p-12"
      >
        <div className="text-center">
          <span className="label-pill mb-4 inline-flex">Why FlowCart</span>
          <h2 className="text-balance text-2xl font-semibold tracking-[-0.02em] text-[var(--foreground)] sm:text-3xl">
            Built for modern sellers
          </h2>
          <p className="mx-auto mt-3 max-w-lg text-pretty text-[var(--muted-foreground)]">
            Every feature designed to eliminate repetitive work and prevent costly mistakes.
          </p>
        </div>

        <ul className="mt-8 grid gap-3 sm:grid-cols-2">
          {VALUE_POINTS.map((point, index) => (
            <motion.li
              key={point}
              initial={{ opacity: 0, x: -8 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.3, delay: index * 0.08 }}
              className="flex items-start gap-3"
            >
              <span className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-[var(--success)]/10">
                <Check size={12} className="text-[var(--success)]" />
              </span>
              <span className="text-sm text-[var(--foreground)]">{point}</span>
            </motion.li>
          ))}
        </ul>
      </motion.section>

      {/* Final CTA */}
      <motion.section
        initial={{ opacity: 0, y: 16 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.4 }}
        transition={{ duration: 0.5 }}
        className="text-center"
      >
        <h2 className="text-balance text-2xl font-semibold tracking-[-0.02em] text-[var(--foreground)] sm:text-3xl">
          Ready to streamline your launches?
        </h2>
        <p className="mx-auto mt-3 max-w-md text-pretty text-[var(--muted-foreground)]">
          Start using FlowCart today and save hours on every product launch.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
          <Link
            href="/dashboard"
            className="btn-primary group"
          >
            Open Dashboard
            <ArrowRight size={16} className="transition-transform group-hover:translate-x-0.5" />
          </Link>
          <Link
            href="/auth"
            className="btn-secondary"
          >
            Sign in
          </Link>
        </div>
      </motion.section>
    </div>
  );
}
