"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, ImagePlus, PencilLine, RefreshCcw, Send } from "lucide-react";
import { ShopifyMark, InstagramMark } from "@/src/components/ui/brand-icons";
import { readApiResponse } from "@/src/components/api-response";
import { useAuth } from "@/src/context/AuthContext";
import type { InstagramConnectionSummary, SafeSettingsStatus } from "@/src/lib/types";

interface SettingsPayload {
  status: SafeSettingsStatus;
  instagramConnection: InstagramConnectionSummary;
}

interface GuideStep {
  number: number;
  title: string;
  body: string;
  href: string;
  icon: ReactNode;
}

export default function InfoPage() {
  const { user, loading: authLoading } = useAuth();
  const [shopifyConnected, setShopifyConnected] = useState(false);
  const [instagramConnected, setInstagramConnected] = useState(false);

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
        setInstagramConnected(Boolean(payload.data.instagramConnection?.canPublish));
      } catch {
        // Keep info page resilient; links still work without status chips.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [authLoading, user]);

  const steps: GuideStep[] = [
    {
      number: 1,
      title: "Add photos",
      body: "Upload product photos from your phone or desktop.",
      href: "/dashboard",
      icon: <ImagePlus size={18} strokeWidth={1.9} />,
    },
    {
      number: 2,
      title: "Add product details",
      body: "Write the title, caption, price, and quantity.",
      href: "/dashboard",
      icon: <PencilLine size={18} strokeWidth={1.9} />,
    },
    {
      number: 3,
      title: "Connect Shopify",
      body: "Connect your store so FlowCart can create and update products.",
      href: "/settings#shopify",
      icon: <ShopifyMark size={18} />,
    },
    {
      number: 4,
      title: "Connect Instagram",
      body: "Connect the Instagram account where FlowCart publishes posts.",
      href: "/settings#instagram",
      icon: <InstagramMark size={18} />,
    },
    {
      number: 5,
      title: "Post once",
      body: "Publish one post to both Shopify and Instagram.",
      href: "/dashboard",
      icon: <Send size={18} strokeWidth={1.9} />,
    },
    {
      number: 6,
      title: "Update everywhere",
      body: "Edit once and push updates to every connected channel.",
      href: "/dashboard",
      icon: <RefreshCcw size={18} strokeWidth={1.9} />,
    },
  ];

  return (
    <div className="w-full space-y-5">
      <section className="rounded-2xl border border-[color:var(--fc-border-subtle)] bg-white p-5 sm:p-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[color:var(--fc-text-soft)]">
          FlowCart guide
        </p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-[color:var(--fc-text-primary)] sm:text-4xl">
          Post once. Share everywhere.
        </h1>
        <p className="mt-2 max-w-3xl text-sm text-[color:var(--fc-text-muted)] sm:text-base">
          Follow these six steps to go from photos to published posts across Shopify and Instagram.
        </p>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {steps.map((step) => {
          const showConnected =
            (step.number === 3 && shopifyConnected) ||
            (step.number === 4 && instagramConnected);

          return (
            <Link
              key={step.number}
              href={step.href}
              className="group flex h-full flex-col rounded-xl border border-[color:var(--fc-border-subtle)] bg-white p-4 transition hover:border-[color:var(--fc-border-strong)] hover:bg-[color:var(--fc-surface-muted)]"
            >
              <div className="flex items-start justify-between gap-3">
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-[color:var(--fc-surface-muted)] text-[color:var(--fc-text-primary)]">
                  {step.icon}
                </span>
                <div className="flex items-center gap-2">
                  {showConnected ? (
                    <span className="inline-flex items-center rounded-full border border-[rgba(22,163,74,0.32)] bg-[rgba(22,163,74,0.08)] px-2 py-0.5 text-[10px] font-semibold text-[#15803d]">
                      Connected
                    </span>
                  ) : null}
                  <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full border border-[color:var(--fc-border-strong)] px-1.5 text-[10px] font-semibold text-[color:var(--fc-text-primary)]">
                    {step.number}
                  </span>
                </div>
              </div>

              <h2 className="mt-3 text-base font-semibold text-[color:var(--fc-text-primary)]">
                {step.title}
              </h2>
              <p className="mt-1 flex-1 text-sm text-[color:var(--fc-text-muted)]">{step.body}</p>

              <span className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-[color:var(--fc-text-primary)]">
                Open
                <ArrowRight size={14} className="transition-transform group-hover:translate-x-0.5" />
              </span>
            </Link>
          );
        })}
      </section>

      <section className="rounded-2xl border border-[color:var(--fc-border-subtle)] bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-[color:var(--fc-text-primary)]">Ready?</h2>
            <p className="mt-1 text-sm text-[color:var(--fc-text-muted)]">
              Start with your next post now.
            </p>
          </div>
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-1 rounded-lg bg-[#111111] px-4 py-2 text-sm font-semibold text-white"
          >
            Start posting
            <ArrowRight size={14} />
          </Link>
        </div>
      </section>
    </div>
  );
}
