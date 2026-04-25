"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  ArrowRight,
  CheckCircle2,
  ImagePlus,
  PencilLine,
  RefreshCcw,
  Send,
} from "lucide-react";
import {
  ShopifyMark,
  InstagramMark,
} from "@/src/components/ui/brand-icons";
import { readApiResponse } from "@/src/components/api-response";
import { useAuth } from "@/src/context/AuthContext";
import type {
  InstagramConnectionSummary,
  SafeSettingsStatus,
} from "@/src/lib/types";

interface SettingsPayload {
  status: SafeSettingsStatus;
  instagramConnection: InstagramConnectionSummary;
}

interface StepCard {
  number: number;
  title: string;
  body: string;
  href: string;
  icon: React.ReactNode;
  cta: string;
}

export default function InfoPage() {
  const { user, loading: authLoading } = useAuth();
  const [shopifyConnected, setShopifyConnected] = useState<boolean>(false);
  const [shopifyDomain, setShopifyDomain] = useState<string>("");
  const [igConnected, setIgConnected] = useState<boolean>(false);
  const [igPageName, setIgPageName] = useState<string>("");

  useEffect(() => {
    if (authLoading || !user) {
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch("/api/settings", { cache: "no-store" });
        const payload = await readApiResponse<SettingsPayload>(response);
        if (cancelled || !response.ok || !payload?.ok || !payload.data) {
          return;
        }
        setShopifyConnected(Boolean(payload.data.status.shopifyConnected));
        setIgConnected(
          Boolean(payload.data.instagramConnection?.canPublish)
        );
        setIgPageName(
          payload.data.instagramConnection?.selectedPageName ?? ""
        );
      } catch {
        // Info page is non-critical — silently degrade.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authLoading, user]);

  // Derive a Shopify admin URL only if a domain is saved (we only have it via
  // settings; the public list endpoint doesn't include it). For a cleaner Info
  // page we link straight to /settings#shopify which is always safe.
  const shopifyHref = "/settings#shopify";
  const instagramHref = "/settings#instagram";

  const steps: StepCard[] = [
    {
      number: 1,
      title: "Add photos",
      body: "Upload product photos right inside a post. Drag, drop, or pick from your device.",
      href: "/dashboard",
      icon: <ImagePlus size={20} strokeWidth={1.8} />,
      cta: "Open Posts",
    },
    {
      number: 2,
      title: "Add caption and details",
      body: "Write a caption, set price and quantity. AI can polish your copy in one tap.",
      href: "/dashboard",
      icon: <PencilLine size={20} strokeWidth={1.8} />,
      cta: "Open Posts",
    },
    {
      number: 3,
      title: "Connect Shopify",
      body: shopifyConnected
        ? `Connected${shopifyDomain ? ` to ${shopifyDomain}` : ""}. FlowCart will create and update products here.`
        : "Connect your Shopify store so FlowCart can create and update products.",
      href: shopifyHref,
      icon: <ShopifyMark size={20} />,
      cta: shopifyConnected ? "Manage Shopify" : "Connect Shopify",
    },
    {
      number: 4,
      title: "Connect Instagram",
      body: igConnected
        ? `Connected${igPageName ? ` to ${igPageName}` : ""}. FlowCart publishes posts to this account.`
        : "Connect the Instagram account where FlowCart should publish posts.",
      href: instagramHref,
      icon: <InstagramMark size={20} />,
      cta: igConnected ? "Manage Instagram" : "Connect Instagram",
    },
    {
      number: 5,
      title: "Post once",
      body: "Tap Post on a single post, or Post All to share every ready post to Shopify and Instagram together.",
      href: "/dashboard",
      icon: <Send size={20} strokeWidth={1.8} />,
      cta: "Open Posts",
    },
    {
      number: 6,
      title: "Update everywhere",
      body: "Edit a posted item once, then update Shopify and Instagram together — no duplicates, no manual sync.",
      href: "/dashboard",
      icon: <RefreshCcw size={20} strokeWidth={1.8} />,
      cta: "Open Posts",
    },
  ];

  return (
    <div className="w-full space-y-6">
      <motion.section
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="rounded-2xl border border-[color:var(--fc-border-subtle)] bg-white p-6 sm:p-8"
      >
        <div className="flex items-start gap-4">
          <Image
            src="/brand/flowcart-symbol.png"
            alt=""
            width={88}
            height={88}
            priority
            className="hidden h-12 w-12 object-contain sm:block"
          />
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--fc-text-soft)]">
              How it works
            </p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight text-[color:var(--fc-text-primary)] sm:text-4xl">
              Everything you need, in six steps
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[color:var(--fc-text-muted)] sm:text-base">
              FlowCart turns one product post into a clean Shopify listing and
              Instagram post — and keeps them in sync when you edit. Tap any
              step to jump in.
            </p>
          </div>
        </div>
      </motion.section>

      <section
        aria-label="FlowCart steps"
        className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
      >
        {steps.map((step, idx) => {
          const isShopify = step.number === 3;
          const isInstagram = step.number === 4;
          const connected =
            (isShopify && shopifyConnected) ||
            (isInstagram && igConnected);
          return (
            <motion.div
              key={step.number}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, delay: idx * 0.04 }}
            >
              <Link
                href={step.href}
                className="group flex h-full flex-col gap-3 rounded-2xl border border-[color:var(--fc-border-subtle)] bg-white p-5 transition hover:border-[color:var(--fc-border-strong)] hover:shadow-[0_2px_12px_rgba(0,0,0,0.05)] active:translate-y-px"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[color:var(--fc-surface-muted)] text-[color:var(--fc-text-primary)]">
                    {step.icon}
                  </div>
                  <div className="flex items-center gap-1.5">
                    {connected ? (
                      <span className="inline-flex items-center gap-1 rounded-full border border-[rgba(22,163,74,0.32)] bg-[rgba(22,163,74,0.08)] px-2 py-0.5 text-[10px] font-semibold text-[#15803d]">
                        <CheckCircle2 size={11} />
                        Connected
                      </span>
                    ) : null}
                    <span className="inline-flex h-7 min-w-7 items-center justify-center rounded-full bg-[color:var(--fc-text-primary)] px-2 text-[11px] font-semibold text-white">
                      {step.number}
                    </span>
                  </div>
                </div>
                <div className="flex-1 space-y-1">
                  <h2 className="text-base font-semibold text-[color:var(--fc-text-primary)]">
                    {step.title}
                  </h2>
                  <p className="text-sm leading-6 text-[color:var(--fc-text-muted)]">
                    {step.body}
                  </p>
                </div>
                <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-[color:var(--fc-text-primary)]">
                  {step.cta}
                  <ArrowRight
                    size={14}
                    className="transition-transform group-hover:translate-x-0.5"
                  />
                </span>
              </Link>
            </motion.div>
          );
        })}
      </section>

      <section
        aria-label="Quick start"
        className="rounded-2xl border border-[color:var(--fc-border-subtle)] bg-white p-5 sm:p-6"
      >
        <h2 className="text-base font-semibold text-[color:var(--fc-text-primary)]">
          Quick start
        </h2>
        <p className="mt-1 text-sm text-[color:var(--fc-text-muted)]">
          New to FlowCart? Connect Shopify and Instagram first, then create
          your first post.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            href="/settings"
            className="inline-flex items-center gap-1.5 rounded-lg border border-[color:var(--fc-border-strong)] bg-white px-4 py-2 text-sm font-semibold text-[color:var(--fc-text-primary)] transition hover:bg-[color:var(--fc-surface-muted)]"
          >
            Open Settings
            <ArrowRight size={14} />
          </Link>
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#111111] px-4 py-2 text-sm font-semibold text-white transition hover:bg-black"
          >
            Go to Posts
            <ArrowRight size={14} />
          </Link>
        </div>
      </section>
    </div>
  );
}
