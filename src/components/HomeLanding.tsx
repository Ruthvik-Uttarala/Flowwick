"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  ArrowRight,
  CheckCircle2,
  Grid3x3,
  Info as InfoIcon,
  Loader2,
  PlusSquare,
  Sparkles,
} from "lucide-react";
import { useAuth } from "@/src/context/AuthContext";
import { LiquidButton } from "@/src/components/ui/liquid-glass-button";
import {
  ShopifyMark,
  InstagramMark,
} from "@/src/components/ui/brand-icons";
import { apiErrorMessage, readApiResponse } from "@/src/components/api-response";
import type {
  ProductBucket as Bucket,
  InstagramConnectionSummary,
  RuntimeConfigSnapshot,
  SafeSettingsStatus,
} from "@/src/lib/types";

interface SettingsPayload {
  status: SafeSettingsStatus;
  runtime: RuntimeConfigSnapshot;
  instagramConnection: InstagramConnectionSummary;
}

export function HomeLanding() {
  const { user, loading: authLoading } = useAuth();
  const [buckets, setBuckets] = useState<Bucket[]>([]);
  const [status, setStatus] = useState<SafeSettingsStatus | null>(null);
  const [instagramConnection, setInstagramConnection] =
    useState<InstagramConnectionSummary | null>(null);
  const [aiLive, setAiLive] = useState<boolean>(false);
  const [isLoadingFeed, setIsLoadingFeed] = useState<boolean>(false);
  const [creating, setCreating] = useState<boolean>(false);
  const [pageError, setPageError] = useState<string>("");

  const loadHomeData = useCallback(async () => {
    setIsLoadingFeed(true);
    try {
      const [bucketsRes, settingsRes] = await Promise.all([
        fetch("/api/buckets", { cache: "no-store" }),
        fetch("/api/settings", { cache: "no-store" }),
      ]);

      const bucketsPayload = await readApiResponse<{ buckets?: Bucket[] }>(
        bucketsRes
      );
      if (bucketsRes.ok && bucketsPayload?.ok) {
        setBuckets(
          Array.isArray(bucketsPayload.data?.buckets)
            ? bucketsPayload.data!.buckets
            : []
        );
      }

      const settingsPayload =
        await readApiResponse<SettingsPayload>(settingsRes);
      if (settingsRes.ok && settingsPayload?.ok && settingsPayload.data) {
        setStatus(settingsPayload.data.status);
        setInstagramConnection(settingsPayload.data.instagramConnection);
        setAiLive(Boolean(settingsPayload.data.runtime?.openaiConfigured));
      }
    } catch (error) {
      // Home page tolerates failures — Posts page surfaces the real error.
      console.warn("[flowcart:home] failed to load summary data", error);
    } finally {
      setIsLoadingFeed(false);
    }
  }, []);

  useEffect(() => {
    if (authLoading || !user) {
      return;
    }
    void loadHomeData();
  }, [authLoading, user, loadHomeData]);

  const handleCreate = useCallback(async () => {
    setCreating(true);
    setPageError("");
    try {
      const response = await fetch("/api/buckets/create", { method: "POST" });
      const payload = await readApiResponse<{ bucket?: Bucket }>(response);
      if (!response.ok || !payload?.ok || !payload.data?.bucket) {
        throw new Error(apiErrorMessage(payload, "Failed to create post."));
      }
      // Hand off to /dashboard where the create-post flow continues.
      window.location.href = `/dashboard#bucket-${payload.data.bucket.id}`;
    } catch (error) {
      setPageError(
        error instanceof Error ? error.message : "Failed to create post."
      );
      setCreating(false);
    }
  }, []);

  // ----- Logged-out state -----
  if (!authLoading && !user) {
    return <SignedOutHero />;
  }

  if (authLoading) {
    return (
      <div className="flex w-full items-center justify-center py-16">
        <Loader2
          size={22}
          className="animate-spin text-[color:var(--fc-text-muted)]"
        />
      </div>
    );
  }

  const readyCount = buckets.filter((b) => b.status === "READY").length;
  const postedCount = buckets.filter((b) => b.status === "DONE").length;
  const draftCount = buckets.filter((b) => b.status === "EMPTY").length;
  const recentBuckets = [...buckets].slice(0, 8);

  const shopifyConnected = Boolean(status?.shopifyConnected);
  const instagramConnected = Boolean(instagramConnection?.canPublish);

  return (
    <div className="w-full space-y-6">
      <motion.section
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="rounded-2xl border border-[color:var(--fc-border-subtle)] bg-white p-6 sm:p-8"
      >
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
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
                {user?.email
                  ? `Signed in as ${user.email}`
                  : "Welcome back"}
              </p>
              <h1 className="mt-1 text-3xl font-semibold tracking-tight text-[color:var(--fc-text-primary)] sm:text-4xl">
                Ready to post?
              </h1>
              <p className="mt-2 max-w-xl text-sm leading-6 text-[color:var(--fc-text-muted)] sm:text-base">
                Create once. Share to Shopify and Instagram.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 lg:flex-nowrap">
            <LiquidButton
              variant="primary"
              size="lg"
              onClick={handleCreate}
              disabled={creating}
              aria-label="Create post"
              className="flex-1 sm:flex-none"
            >
              {creating ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <PlusSquare size={16} />
              )}
              <span>Create</span>
            </LiquidButton>
            <LiquidButton
              asChild
              variant="secondary"
              size="lg"
              className="flex-1 sm:flex-none"
            >
              <Link href="/dashboard" aria-label="Open posts">
                <Grid3x3 size={16} />
                <span>Posts</span>
              </Link>
            </LiquidButton>
          </div>
        </div>

        {pageError ? (
          <p className="mt-4 rounded-lg border border-[color:var(--fc-border-strong)] bg-white px-4 py-2.5 text-sm text-[color:var(--fc-text-primary)]">
            {pageError}
          </p>
        ) : null}
      </motion.section>

      {/* Connection / readiness summary */}
      <section
        aria-label="Connection status"
        className="grid grid-cols-2 gap-3 sm:grid-cols-4"
      >
        <StatusCell
          label="Shopify"
          icon={<ShopifyMark size={18} />}
          state={shopifyConnected ? "ok" : "off"}
          valueLabel={shopifyConnected ? "Connected" : "Not set"}
        />
        <StatusCell
          label="Instagram"
          icon={<InstagramMark size={18} />}
          state={instagramConnected ? "ok" : "off"}
          valueLabel={instagramConnected ? "Connected" : "Not set"}
        />
        <StatusCell
          label="AI"
          icon={<Sparkles size={18} strokeWidth={1.8} />}
          state={aiLive ? "ok" : "off"}
          valueLabel={aiLive ? "Live" : "Off"}
        />
        <StatusCell
          label="Ready"
          icon={<CheckCircle2 size={18} strokeWidth={1.8} />}
          state={readyCount > 0 ? "ok" : "neutral"}
          valueLabel={`${readyCount} post${readyCount === 1 ? "" : "s"}`}
        />
      </section>

      {/* Recent posts preview */}
      <section
        aria-label="Recent posts"
        className="rounded-2xl border border-[color:var(--fc-border-subtle)] bg-white p-4 sm:p-5"
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-[color:var(--fc-text-primary)]">
              Recent posts
            </h2>
            <p className="mt-0.5 text-xs text-[color:var(--fc-text-muted)]">
              {buckets.length === 0
                ? "Your posts will appear here."
                : `${postedCount} posted · ${readyCount} ready · ${draftCount} draft`}
            </p>
          </div>
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-[color:var(--fc-text-primary)] hover:underline"
          >
            View all
            <ArrowRight size={14} />
          </Link>
        </div>

        {isLoadingFeed && buckets.length === 0 ? (
          <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4 lg:grid-cols-6">
            {Array.from({ length: 6 }).map((_, idx) => (
              <div
                key={idx}
                className="aspect-square animate-pulse rounded-md bg-[color:var(--fc-surface-muted)]"
              />
            ))}
          </div>
        ) : recentBuckets.length === 0 ? (
          <EmptyHomeState onCreate={handleCreate} creating={creating} />
        ) : (
          <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4 lg:grid-cols-6">
            {recentBuckets.map((bucket) => (
              <RecentTile key={bucket.id} bucket={bucket} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function SignedOutHero() {
  return (
    <div className="w-full">
      <section className="rounded-2xl border border-[color:var(--fc-border-subtle)] bg-white p-8 sm:p-12">
        <div className="mx-auto max-w-2xl text-center">
          <Image
            src="/brand/flowcart-stacked.png"
            alt="FlowCart"
            width={520}
            height={520}
            priority
            className="mx-auto h-24 w-auto"
          />
          <h1 className="mt-6 text-3xl font-semibold tracking-tight text-[color:var(--fc-text-primary)] sm:text-4xl">
            Post once. Share everywhere.
          </h1>
          <p className="mt-3 text-sm text-[color:var(--fc-text-muted)] sm:text-base">
            Create one product post and FlowCart shares it to Shopify and
            Instagram together.
          </p>

          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <LiquidButton asChild variant="primary" size="lg">
              <Link href="/auth">
                <span>Sign in</span>
                <ArrowRight size={16} />
              </Link>
            </LiquidButton>
            <LiquidButton asChild variant="secondary" size="lg">
              <Link href="/info">
                <InfoIcon size={16} />
                <span>How it works</span>
              </Link>
            </LiquidButton>
          </div>
        </div>
      </section>
    </div>
  );
}

function StatusCell({
  label,
  icon,
  state,
  valueLabel,
}: {
  label: string;
  icon: React.ReactNode;
  state: "ok" | "off" | "neutral";
  valueLabel: string;
}) {
  const stateClass =
    state === "ok"
      ? "text-[color:var(--fc-text-primary)]"
      : state === "off"
        ? "text-[color:var(--fc-text-soft)]"
        : "text-[color:var(--fc-text-muted)]";
  return (
    <div className="flex items-center gap-3 rounded-xl border border-[color:var(--fc-border-subtle)] bg-white px-3 py-3 sm:px-4">
      <div
        className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[color:var(--fc-surface-muted)] ${stateClass}`}
      >
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[color:var(--fc-text-soft)]">
          {label}
        </p>
        <p className="truncate text-sm font-semibold text-[color:var(--fc-text-primary)]">
          {valueLabel}
        </p>
      </div>
    </div>
  );
}

function RecentTile({ bucket }: { bucket: Bucket }) {
  const firstImage = bucket.imageUrls[0] ?? null;
  const headline =
    bucket.titleEnhanced.trim() ||
    bucket.titleRaw.trim() ||
    "Untitled post";
  return (
    <Link
      href={`/dashboard#bucket-${bucket.id}`}
      className="group relative aspect-square overflow-hidden rounded-md border border-[color:var(--fc-border-subtle)] bg-[color:var(--fc-surface-muted)] transition hover:border-[color:var(--fc-border-strong)]"
      aria-label={headline}
    >
      {firstImage ? (
        <Image
          src={firstImage}
          alt={headline}
          fill
          unoptimized
          className="object-cover"
          sizes="(max-width: 640px) 33vw, (max-width: 1024px) 25vw, 16vw"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-[color:var(--fc-text-soft)]">
          <PlusSquare size={20} strokeWidth={1.5} />
        </div>
      )}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end p-2 opacity-0 transition group-hover:opacity-100">
        <p className="line-clamp-1 text-[10px] font-semibold text-white">
          {bucket.status === "DONE" ? "Posted" : statusToLabel(bucket.status)}
        </p>
      </div>
      <span
        className={`absolute right-1.5 top-1.5 rounded-full px-1.5 py-0.5 text-[9px] font-semibold ${
          bucket.status === "DONE"
            ? "bg-white text-[color:var(--fc-text-primary)] shadow-sm"
            : bucket.status === "FAILED"
              ? "bg-white text-[#b91c1c] shadow-sm"
              : "bg-black/70 text-white"
        }`}
      >
        {statusToLabel(bucket.status)}
      </span>
    </Link>
  );
}

function statusToLabel(status: Bucket["status"]): string {
  switch (status) {
    case "DONE":
      return "Posted";
    case "READY":
      return "Ready";
    case "PROCESSING":
      return "Posting";
    case "ENHANCING":
      return "Polishing";
    case "FAILED":
      return "Issue";
    default:
      return "Draft";
  }
}

function EmptyHomeState({
  onCreate,
  creating,
}: {
  onCreate: () => void;
  creating: boolean;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-[color:var(--fc-border-strong)] bg-[color:var(--fc-surface-muted)] px-6 py-10 text-center">
      <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-white">
        <PlusSquare
          size={22}
          strokeWidth={1.6}
          className="text-[color:var(--fc-text-primary)]"
        />
      </div>
      <div>
        <p className="text-sm font-semibold text-[color:var(--fc-text-primary)]">
          No posts yet
        </p>
        <p className="mt-0.5 text-xs text-[color:var(--fc-text-muted)]">
          Create your first post and share it to Shopify and Instagram.
        </p>
      </div>
      <LiquidButton
        variant="primary"
        size="md"
        onClick={onCreate}
        disabled={creating}
      >
        {creating ? (
          <Loader2 size={14} className="animate-spin" />
        ) : (
          <PlusSquare size={14} />
        )}
        <span>Create post</span>
      </LiquidButton>
    </div>
  );
}
