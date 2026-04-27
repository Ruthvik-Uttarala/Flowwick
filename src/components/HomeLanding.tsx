"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  ArrowRight,
  BriefcaseBusiness,
  CheckCircle2,
  Grid3x3,
  Loader2,
  PackageCheck,
  Plus,
  PlusSquare,
  Sparkles,
  Store,
  Timer,
  TrendingUp,
} from "lucide-react";
import { motion } from "framer-motion";
import { useAuth } from "@/src/context/AuthContext";
import { apiErrorMessage, readApiResponse } from "@/src/components/api-response";
import { InstagramMark, ShopifyMark } from "@/src/components/ui/brand-icons";
import { LiquidButton } from "@/src/components/ui/liquid-glass-button";
import type {
  InstagramConnectionSummary,
  ProductBucket as Bucket,
  RuntimeConfigSnapshot,
  SafeSettingsStatus,
} from "@/src/lib/types";

interface SettingsPayload {
  status: SafeSettingsStatus;
  runtime: RuntimeConfigSnapshot;
  instagramConnection: InstagramConnectionSummary;
}

interface QuickAction {
  title: string;
  subtitle: string;
  href?: string;
  icon: ReactNode;
  onClick?: () => void;
}

export function HomeLanding() {
  const { user, loading: authLoading } = useAuth();
  const [posts, setPosts] = useState<Bucket[]>([]);
  const [status, setStatus] = useState<SafeSettingsStatus | null>(null);
  const [instagramConnection, setInstagramConnection] =
    useState<InstagramConnectionSummary | null>(null);
  const [aiLive, setAiLive] = useState(false);
  const [isLoadingFeed, setIsLoadingFeed] = useState(false);
  const [creating, setCreating] = useState(false);
  const [pageError, setPageError] = useState("");

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
        setPosts(
          Array.isArray(bucketsPayload.data?.buckets)
            ? bucketsPayload.data.buckets
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
      console.warn("[flowwick:home] summary fetch failed", error);
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
      window.location.href = `/dashboard#bucket-${payload.data.bucket.id}`;
    } catch (error) {
      setPageError(
        error instanceof Error ? error.message : "Failed to create post."
      );
      setCreating(false);
    }
  }, []);

  if (!authLoading && !user) {
    return <SignedOutHome />;
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

  const readyCount = posts.filter((post) => post.status === "READY").length;
  const postedCount = posts.filter((post) => post.status === "DONE").length;
  const issueCount = posts.filter((post) => post.status === "FAILED").length;
  const recentPosts = [...posts].slice(0, 12);

  const quickActions: QuickAction[] = [
    {
      title: "Create",
      subtitle: "Start a new post now.",
      icon: <PlusSquare size={17} strokeWidth={1.9} />,
      onClick: handleCreate,
    },
    {
      title: "Posts",
      subtitle: "View and edit all posts.",
      href: "/dashboard",
      icon: <Grid3x3 size={17} strokeWidth={1.9} />,
    },
    {
      title: "Connect Shopify",
      subtitle: "Link your Shopify store.",
      href: "/settings#shopify",
      icon: <ShopifyMark size={17} />,
    },
    {
      title: "Connect Instagram",
      subtitle: "Link your Instagram account.",
      href: "/settings#instagram",
      icon: <InstagramMark size={17} />,
    },
  ];

  return (
    <div className="w-full space-y-6">
      <section className="rounded-2xl border border-[color:var(--fc-border-subtle)] bg-white p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-[color:var(--fc-text-primary)] sm:text-[2.1rem]">
              Ready to post?
            </h1>
            <p className="mt-2 text-sm text-[color:var(--fc-text-muted)] sm:text-base">
              Create once. Share to Shopify and Instagram.
            </p>
          </div>
          <div className="grid w-full gap-2 sm:w-auto sm:grid-cols-2">
            <LiquidButton
              onClick={handleCreate}
              disabled={creating}
              variant="primary"
              size="lg"
              className="h-10"
              contentClassName="inline-flex items-center justify-center gap-2"
            >
              {creating ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Plus size={14} />
              )}
              Create
            </LiquidButton>
            <LiquidButton
              asChild
              variant="secondary"
              size="lg"
              className="h-10"
              contentClassName="inline-flex items-center justify-center gap-2"
            >
              <Link href="/dashboard" aria-label="Open posts">
                <Grid3x3 size={14} />
                Posts
              </Link>
            </LiquidButton>
          </div>
        </div>
        {pageError ? (
          <p className="mt-3 rounded-lg border border-[rgba(220,38,38,0.25)] bg-[rgba(220,38,38,0.05)] px-3 py-2 text-sm text-[#b42318]">
            {pageError}
          </p>
        ) : null}
      </section>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatusPill
          label="Shopify"
          value={status?.shopifyConnected ? "Connected" : "Not connected"}
          icon={<ShopifyMark size={16} />}
        />
        <StatusPill
          label="Instagram"
          value={instagramConnection?.canPublish ? "Connected" : "Not connected"}
          icon={<InstagramMark size={16} />}
        />
        <StatusPill
          label="AI"
          value={aiLive ? "On" : "Off"}
          icon={<CheckCircle2 size={16} strokeWidth={1.8} />}
        />
        <StatusPill
          label="Ready"
          value={`${readyCount}`}
          icon={<Store size={16} strokeWidth={1.8} />}
        />
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {quickActions.map((action) => (
          <QuickActionCard key={action.title} action={action} />
        ))}
      </section>

      <section className="rounded-2xl border border-[color:var(--fc-border-subtle)] bg-white p-4 sm:p-5">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-[color:var(--fc-text-primary)]">
              Recent posts
            </h2>
            <p className="mt-0.5 text-xs text-[color:var(--fc-text-muted)]">
              {postedCount} posted, {readyCount} ready, {issueCount} issues
            </p>
          </div>
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-1 text-sm font-semibold text-[color:var(--fc-text-primary)]"
          >
            Posts
            <ArrowRight size={14} />
          </Link>
        </div>

        {isLoadingFeed && posts.length === 0 ? (
          <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4 lg:grid-cols-6">
            {Array.from({ length: 12 }).map((_, index) => (
              <div
                key={`home-skeleton-${index}`}
                className="aspect-square animate-pulse rounded-sm bg-[color:var(--fc-surface-muted)]"
              />
            ))}
          </div>
        ) : recentPosts.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-[color:var(--fc-border-strong)] bg-[color:var(--fc-surface-muted)] px-4 py-8 text-center">
            <p className="text-sm font-semibold text-[color:var(--fc-text-primary)]">
              No posts yet
            </p>
            <p className="text-xs text-[color:var(--fc-text-muted)]">
              Create your first post to start sharing.
            </p>
            <LiquidButton onClick={handleCreate} disabled={creating} variant="primary" size="sm">
              {creating ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
              Create
            </LiquidButton>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4 lg:grid-cols-6">
            {recentPosts.map((post, index) => (
              <RecentPostTile key={post.id} post={post} index={index + 1} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function SignedOutHome() {
  const metrics = [
    {
      title: "Save 6+ hours every week",
      detail: "Less duplicate posting, more selling time.",
      icon: <Timer size={18} strokeWidth={1.9} />,
    },
    {
      title: "Post to 2 channels from 1 upload",
      detail: "One product flow for Shopify and Instagram.",
      icon: <PackageCheck size={18} strokeWidth={1.9} />,
    },
    {
      title: "Launch 100+ products faster",
      detail: "Built for fast-moving boutique catalogs.",
      icon: <TrendingUp size={18} strokeWidth={1.9} />,
    },
    {
      title: "Reduce duplicate posting work",
      detail: "Flowwick becomes your posting employee.",
      icon: <BriefcaseBusiness size={18} strokeWidth={1.9} />,
    },
  ];

  const setupSteps = [
    "1. Tell us what you sell",
    "2. Connect Shopify",
    "3. Connect Instagram",
  ];

  return (
    <section className="w-full space-y-5">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="grid gap-6 rounded-[26px] border border-[color:var(--fc-border-subtle)] bg-white p-5 sm:p-8 lg:grid-cols-[1fr_1fr] lg:p-10"
      >
        <div className="flex flex-col justify-center">
          <Image src="/brand/flowwick-logo-v1.png" alt="Flowwick" width={520} height={180} priority className="h-auto w-[178px] sm:w-[198px]" />
          <h1 className="mt-6 text-4xl font-semibold tracking-tight text-[color:var(--fc-text-primary)] sm:text-[3.2rem]">
            Post once. Sell everywhere.
          </h1>
          <p className="mt-3 max-w-[560px] text-sm text-[color:var(--fc-text-muted)] sm:text-base">
            Flowwick turns one product upload into Shopify products and Instagram posts.
          </p>
          <p className="mt-2 max-w-[560px] text-sm text-[color:var(--fc-text-muted)] sm:text-base">
            One upload. Shopify and Instagram handled.
          </p>
          <div className="mt-7 grid grid-cols-1 gap-2 sm:flex sm:flex-wrap sm:items-center">
            <LiquidButton
              asChild
              variant="primary"
              size="lg"
              className="h-11 sm:min-w-[170px]"
              contentClassName="inline-flex items-center justify-center gap-2 whitespace-nowrap"
            >
              <Link href="/auth?redirectTo=%2Finfo%3Fmode%3Dquiz">
                Start setup
                <ArrowRight size={16} />
              </Link>
            </LiquidButton>
            <LiquidButton
              asChild
              variant="secondary"
              size="lg"
              className="h-11 sm:min-w-[170px]"
              contentClassName="inline-flex items-center justify-center gap-2 whitespace-nowrap"
            >
              <Link href="/info">
                See how it works
                <Sparkles size={15} />
              </Link>
            </LiquidButton>
          </div>
        </div>

        <div className="relative min-h-[360px] overflow-hidden rounded-2xl border border-[color:var(--fc-border-subtle)] bg-[#f3efe9] sm:min-h-[460px] lg:min-h-[620px]">
          <Image src="/brand/flowwick-home-bg.png" alt="Boutique products prepared for posting" fill priority className="object-cover object-center" sizes="(max-width: 1024px) 100vw, 50vw" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/22 via-black/0 to-transparent" />
          <div className="absolute bottom-4 left-4 right-4 rounded-xl border border-white/25 bg-black/35 px-4 py-3 text-white backdrop-blur-sm">
            <p className="text-sm font-semibold">Flowwick as your posting employee</p>
            <p className="mt-1 text-xs text-white/90">Let Flowwick handle product posting while you focus on sales.</p>
          </div>
        </div>
      </motion.div>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric, index) => (
          <motion.article
            key={metric.title}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, delay: 0.05 * (index + 1) }}
            className="rounded-2xl border border-[color:var(--fc-border-subtle)] bg-white p-4"
          >
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-[color:var(--fc-surface-muted)] text-[color:var(--fc-text-primary)]">
              {metric.icon}
            </span>
            <h2 className="mt-3 text-base font-semibold text-[color:var(--fc-text-primary)]">{metric.title}</h2>
            <p className="mt-1 text-sm text-[color:var(--fc-text-muted)]">{metric.detail}</p>
          </motion.article>
        ))}
      </section>

      <p className="text-xs text-[color:var(--fc-text-soft)]">
        Estimates vary by catalog size and workflow.
      </p>

      <section className="grid gap-5 rounded-2xl border border-[color:var(--fc-border-subtle)] bg-white p-5 sm:p-6 lg:grid-cols-[0.92fr_1.08fr]">
        <div className="flex flex-col justify-center">
          <h2 className="text-3xl font-semibold tracking-tight text-[color:var(--fc-text-primary)] sm:text-[2.55rem]">
            Your business needs you for more than uploads.
          </h2>
          <p className="mt-3 text-sm text-[color:var(--fc-text-muted)] sm:text-base">
            Let Flowwick handle product posting while you focus on customers, styling, sourcing, and sales.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <span className="inline-flex items-center rounded-full border border-[color:var(--fc-border-subtle)] bg-[color:var(--fc-surface-muted)] px-3 py-1 text-xs font-semibold text-[color:var(--fc-text-primary)]">
              Shopify ready
            </span>
            <span className="inline-flex items-center rounded-full border border-[color:var(--fc-border-subtle)] bg-[color:var(--fc-surface-muted)] px-3 py-1 text-xs font-semibold text-[color:var(--fc-text-primary)]">
              Instagram ready
            </span>
            <span className="inline-flex items-center rounded-full border border-[color:var(--fc-border-subtle)] bg-[color:var(--fc-surface-muted)] px-3 py-1 text-xs font-semibold text-[color:var(--fc-text-primary)]">
              Ready to post
            </span>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="relative min-h-[220px] overflow-hidden rounded-xl border border-[color:var(--fc-border-subtle)] bg-[color:var(--fc-surface-muted)] sm:min-h-[260px]">
            <Image src="/brand/flowwick-product-visual.png" alt="Flowwick product posting view" fill className="object-cover object-center" sizes="(max-width: 1024px) 100vw, 40vw" />
          </div>
          <div className="relative min-h-[220px] overflow-hidden rounded-xl border border-[color:var(--fc-border-subtle)] bg-[color:var(--fc-surface-muted)] sm:min-h-[260px]">
            <Image src="/brand/flowwick-onboarding-visual-2.png" alt="Flowwick Shopify and Instagram preview" fill className="object-cover object-center" sizes="(max-width: 1024px) 100vw, 40vw" />
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-[color:var(--fc-border-subtle)] bg-white p-5 sm:p-6">
        <h2 className="text-2xl font-semibold tracking-tight text-[color:var(--fc-text-primary)] sm:text-[2.2rem]">
          Setup preview
        </h2>
        <p className="mt-2 text-sm text-[color:var(--fc-text-muted)] sm:text-base">
          Start setup in minutes with a simple 3-step flow.
        </p>
        <div className="mt-4 grid gap-3 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="grid gap-2">
            {setupSteps.map((step, index) => (
              <motion.div
                key={step}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.24, delay: 0.08 * (index + 1) }}
                className="rounded-xl border border-[color:var(--fc-border-subtle)] bg-[color:var(--fc-surface-muted)] px-4 py-3 text-sm font-semibold text-[color:var(--fc-text-primary)]"
              >
                {step}
              </motion.div>
            ))}
          </div>
          <div className="relative min-h-[220px] overflow-hidden rounded-xl border border-[color:var(--fc-border-subtle)] bg-[color:var(--fc-surface-muted)]">
            <Image src="/brand/flowwick-onboarding-visual-1.png" alt="Setup walkthrough preview" fill className="object-cover object-center" sizes="(max-width: 1024px) 100vw, 36vw" />
          </div>
        </div>
      </section>
    </section>
  );
}

function QuickActionCard({ action }: { action: QuickAction }) {
  if (action.href) {
    return (
      <Link
        href={action.href}
        className="group rounded-xl border border-[color:var(--fc-border-subtle)] bg-white p-4 transition hover:border-[color:var(--fc-border-strong)] hover:bg-[color:var(--fc-surface-muted)]"
      >
        <div className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-[color:var(--fc-surface-muted)] text-[color:var(--fc-text-primary)]">
          {action.icon}
        </div>
        <p className="mt-3 text-sm font-semibold text-[color:var(--fc-text-primary)]">
          {action.title}
        </p>
        <p className="mt-1 text-xs text-[color:var(--fc-text-muted)]">{action.subtitle}</p>
      </Link>
    );
  }

  return (
    <button
      type="button"
      onClick={action.onClick}
      className="group text-left rounded-xl border border-[color:var(--fc-border-subtle)] bg-white p-4 transition hover:border-[color:var(--fc-border-strong)] hover:bg-[color:var(--fc-surface-muted)]"
    >
      <div className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-[color:var(--fc-surface-muted)] text-[color:var(--fc-text-primary)]">
        {action.icon}
      </div>
      <p className="mt-3 text-sm font-semibold text-[color:var(--fc-text-primary)]">
        {action.title}
      </p>
      <p className="mt-1 text-xs text-[color:var(--fc-text-muted)]">{action.subtitle}</p>
    </button>
  );
}

function StatusPill({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: ReactNode;
}) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-[color:var(--fc-border-subtle)] bg-white px-3 py-2.5">
      <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[color:var(--fc-surface-muted)] text-[color:var(--fc-text-primary)]">
        {icon}
      </span>
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[color:var(--fc-text-soft)]">
          {label}
        </p>
        <p className="text-sm font-semibold text-[color:var(--fc-text-primary)]">{value}</p>
      </div>
    </div>
  );
}

function RecentPostTile({ post, index }: { post: Bucket; index: number }) {
  const image = post.imageUrls[0] ?? null;
  const label = post.titleEnhanced.trim() || post.titleRaw.trim() || `Post ${index}`;

  return (
    <Link
      href={`/dashboard#bucket-${post.id}`}
      className="group relative aspect-square overflow-hidden rounded-sm border border-[color:var(--fc-border-subtle)] bg-[color:var(--fc-surface-muted)]"
      aria-label={label}
    >
      {image ? (
        <Image
          src={image}
          alt={label}
          fill
          unoptimized
          className="object-cover"
          sizes="(max-width: 640px) 33vw, (max-width: 1024px) 25vw, 16vw"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-[color:var(--fc-text-soft)]">
          <PlusSquare size={18} strokeWidth={1.8} />
        </div>
      )}
      <div className="tile-overlay pointer-events-none absolute inset-x-0 bottom-0 p-2 opacity-0 transition group-hover:opacity-100">
        <p className="line-clamp-1 text-[10px] font-semibold text-white">{label}</p>
      </div>
    </Link>
  );
}
