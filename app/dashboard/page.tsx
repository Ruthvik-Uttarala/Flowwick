"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { useAuth } from "@/src/context/AuthContext";
import { ProductBucket } from "@/src/components/ProductBucket";
import { apiErrorMessage, readApiResponse } from "@/src/components/api-response";
import {
  applyCreatedBucket,
  applyMoveToTrash,
  applyPermanentDelete,
  applyRestoreFromTrash,
  getTrashDaysRemaining,
  upsertBucketById,
} from "@/src/lib/dashboard-buckets";
import {
  Plus,
  Rocket,
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  Zap,
  RotateCcw,
  Trash2,
} from "lucide-react";
import type {
  ApiResponseShape,
  EditableBucketField,
  GoAllSummary,
  ProductBucket as Bucket,
} from "@/src/lib/types";

interface BucketActionState {
  saving: boolean;
  uploading: boolean;
  enhancingTitle: boolean;
  enhancingDescription: boolean;
  launching: boolean;
  trashing: boolean;
  deleting: boolean;
  restoring: boolean;
}

interface RuntimeHealth {
  openaiConfigured: boolean;
  settingsConfigured: boolean;
}

const EMPTY_ACTION_STATE: BucketActionState = {
  saving: false,
  uploading: false,
  enhancingTitle: false,
  enhancingDescription: false,
  launching: false,
  trashing: false,
  deleting: false,
  restoring: false,
};

function bucketFromError(payload: ApiResponseShape<unknown> | null | undefined): Bucket | null {
  const data = payload?.data;
  if (!data || typeof data !== "object") {
    return null;
  }
  return (data as { bucket?: Bucket }).bucket ?? null;
}

export default function DashboardPage() {
  const { user, loading: authLoading } = useAuth();
  const [buckets, setBuckets] = useState<Bucket[]>([]);
  const [trashedBuckets, setTrashedBuckets] = useState<Bucket[]>([]);
  const [actionsByBucket, setActionsByBucket] = useState<Record<string, BucketActionState>>(
    {}
  );
  const [runtimeHealth, setRuntimeHealth] = useState<RuntimeHealth>({
    openaiConfigured: false,
    settingsConfigured: false,
  });
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState("");
  const [summaryMessage, setSummaryMessage] = useState("");
  const [goAllSummary, setGoAllSummary] = useState<GoAllSummary | null>(null);
  const [isRunningGoAll, setIsRunningGoAll] = useState(false);
  const [pendingScrollBucketId, setPendingScrollBucketId] = useState("");
  const [highlightedBucketId, setHighlightedBucketId] = useState("");
  const bucketRefs = useRef<Record<string, HTMLElement | null>>({});
  const highlightTimeoutRef = useRef<number | null>(null);
  const bucketsRef = useRef<Bucket[]>([]);
  const trashedBucketsRef = useRef<Bucket[]>([]);

  const trashDateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      }),
    []
  );

  const setBucketActionState = (
    bucketId: string,
    updater: (current: BucketActionState) => BucketActionState
  ) => {
    setActionsByBucket((current) => ({
      ...current,
      [bucketId]: updater(current[bucketId] ?? EMPTY_ACTION_STATE),
    }));
  };

  const setCollections = useCallback((nextBuckets: Bucket[], nextTrashedBuckets: Bucket[]) => {
    bucketsRef.current = nextBuckets;
    trashedBucketsRef.current = nextTrashedBuckets;
    setBuckets(nextBuckets);
    setTrashedBuckets(nextTrashedBuckets);
  }, []);

  const applyBucketCollectionsFromPayload = useCallback(
    (payload: { buckets?: Bucket[]; trashedBuckets?: Bucket[] } | undefined): boolean => {
      const hasBuckets = Array.isArray(payload?.buckets);
      const hasTrashedBuckets = Array.isArray(payload?.trashedBuckets);
      if (!hasBuckets && !hasTrashedBuckets) {
        return false;
      }

      const nextBuckets = hasBuckets ? payload?.buckets ?? [] : bucketsRef.current;
      const nextTrashedBuckets = hasTrashedBuckets
        ? payload?.trashedBuckets ?? []
        : trashedBucketsRef.current;
      setCollections(nextBuckets, nextTrashedBuckets);
      return true;
    },
    [setCollections]
  );

  const upsertBucket = (nextBucket: Bucket) => {
    const nextBuckets = upsertBucketById(bucketsRef.current, nextBucket);
    setCollections(nextBuckets, trashedBucketsRef.current);
  };

  const loadBuckets = useCallback(async () => {
    const response = await fetch("/api/buckets", { cache: "no-store" });
    const payload = await readApiResponse<{
      buckets?: Bucket[];
      trashedBuckets?: Bucket[];
    }>(response);
    if (!response.ok || !payload?.ok) {
      throw new Error(apiErrorMessage(payload, "Failed to load buckets."));
    }

    const nextBuckets = Array.isArray(payload.data?.buckets) ? payload.data.buckets : [];
    const nextTrashedBuckets = Array.isArray(payload.data?.trashedBuckets)
      ? payload.data.trashedBuckets
      : [];
    setCollections(nextBuckets, nextTrashedBuckets);
    return nextBuckets;
  }, [setCollections]);

  const loadRuntimeHealth = useCallback(async () => {
    try {
      const response = await fetch("/api/health", { cache: "no-store" });
      const payload = await readApiResponse<{
        openaiConfigured?: boolean;
        settings?: { configured?: boolean };
      }>(response);
      if (!response.ok || !payload?.ok) {
        throw new Error("Failed to load runtime health.");
      }

      setRuntimeHealth({
        openaiConfigured: Boolean(payload.data?.openaiConfigured),
        settingsConfigured: Boolean(payload.data?.settings?.configured),
      });
    } catch {
      setRuntimeHealth({ openaiConfigured: false, settingsConfigured: false });
    }
  }, []);

  const registerBucketRef = useCallback(
    (bucketId: string) => (element: HTMLElement | null) => {
      bucketRefs.current[bucketId] = element;
    },
    []
  );

  const scrollToBucketIfReady = useCallback((bucketId: string) => {
    if (!bucketId) {
      return false;
    }

    const target = bucketRefs.current[bucketId];
    if (!target) {
      return false;
    }

    target.scrollIntoView({ behavior: "smooth", block: "center" });
    setHighlightedBucketId(bucketId);
    setPendingScrollBucketId("");

    if (highlightTimeoutRef.current) {
      window.clearTimeout(highlightTimeoutRef.current);
    }
    highlightTimeoutRef.current = window.setTimeout(() => {
      setHighlightedBucketId((current) => (current === bucketId ? "" : current));
    }, 1600);

    return true;
  }, []);

  useLayoutEffect(() => {
    if (!pendingScrollBucketId) {
      return;
    }

    if (scrollToBucketIfReady(pendingScrollBucketId)) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      void scrollToBucketIfReady(pendingScrollBucketId);
    });

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [pendingScrollBucketId, buckets.length, scrollToBucketIfReady]);

  useEffect(
    () => () => {
      if (highlightTimeoutRef.current) {
        window.clearTimeout(highlightTimeoutRef.current);
      }
    },
    []
  );

  useEffect(() => {
    if (authLoading || !user) return;

    let active = true;

    const initialize = async () => {
      setLoading(true);
      setPageError("");
      try {
        await Promise.all([loadBuckets(), loadRuntimeHealth()]);
      } catch (error) {
        if (active) {
          setPageError(error instanceof Error ? error.message : "Failed to initialize dashboard.");
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    initialize();
    return () => {
      active = false;
    };
  }, [authLoading, user, loadBuckets, loadRuntimeHealth]);

  if (authLoading) {
    return (
      <div className="flex w-full items-center justify-center py-20">
        <Loader2 size={24} className="animate-spin text-[#C47A2C]" />
      </div>
    );
  }

  if (!user) {
    return null;
  }

  const updateLocalFieldValue = (
    bucketId: string,
    field: EditableBucketField,
    value: string | number | null
  ) => {
    const nextBuckets = bucketsRef.current.map((bucket) =>
      bucket.id === bucketId ? { ...bucket, [field]: value } : bucket
    );
    setCollections(nextBuckets, trashedBucketsRef.current);
  };

  const persistField = async (bucketId: string, field: EditableBucketField) => {
    const target = buckets.find((bucket) => bucket.id === bucketId);
    if (!target) {
      return;
    }

    setBucketActionState(bucketId, (current) => ({ ...current, saving: true }));
    setPageError("");

    try {
      const response = await fetch(`/api/buckets/${bucketId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: target[field] }),
      });
      const payload = await readApiResponse<{ bucket?: Bucket }>(response);
      if (!response.ok || !payload?.ok || !payload.data?.bucket) {
        throw new Error(apiErrorMessage(payload, "Failed to save bucket."));
      }
      upsertBucket(payload.data.bucket);
    } catch (error) {
      setPageError(error instanceof Error ? error.message : "Failed to save bucket.");
    } finally {
      setBucketActionState(bucketId, (current) => ({ ...current, saving: false }));
    }
  };

  const uploadImages = async (bucketId: string, files: FileList | null) => {
    if (!files || files.length === 0) {
      return;
    }

    setBucketActionState(bucketId, (current) => ({ ...current, uploading: true }));
    setPageError("");

    try {
      const formData = new FormData();
      Array.from(files).forEach((file) => formData.append("images", file));

      const response = await fetch(`/api/buckets/${bucketId}/upload`, {
        method: "POST",
        body: formData,
      });
      const payload = await readApiResponse<{ bucket?: Bucket }>(response);
      if (!response.ok || !payload?.ok || !payload.data?.bucket) {
        throw new Error(apiErrorMessage(payload, "Image upload failed."));
      }
      upsertBucket(payload.data.bucket);
    } catch (error) {
      setPageError(error instanceof Error ? error.message : "Image upload failed.");
    } finally {
      setBucketActionState(bucketId, (current) => ({ ...current, uploading: false }));
    }
  };

  const runBucketAction = async (
    bucketId: string,
    path: "enhance-title" | "enhance-description" | "go",
    actionKey: keyof Pick<
      BucketActionState,
      "enhancingTitle" | "enhancingDescription" | "launching"
    >,
    fallbackError: string
  ) => {
    setBucketActionState(bucketId, (current) => ({ ...current, [actionKey]: true }));
    setPageError("");
    setSummaryMessage("");
    setGoAllSummary(null);

    try {
      const response = await fetch(`/api/buckets/${bucketId}/${path}`, { method: "POST" });
      const payload = await readApiResponse<{ bucket?: Bucket }>(response);

      const errorBucket = bucketFromError(payload);
      if (errorBucket) {
        upsertBucket(errorBucket);
      }

      if (!response.ok || !payload?.ok) {
        throw new Error(apiErrorMessage(payload, fallbackError));
      }

      if (payload.data?.bucket) {
        upsertBucket(payload.data.bucket);
      }
      await loadRuntimeHealth();
    } catch (error) {
      setPageError(error instanceof Error ? error.message : fallbackError);
    } finally {
      setBucketActionState(bucketId, (current) => ({ ...current, [actionKey]: false }));
    }
  };

  const createBucketAction = async () => {
    setPageError("");
    try {
      const response = await fetch("/api/buckets/create", { method: "POST" });
      const payload = await readApiResponse<{ bucket?: Bucket }>(response);
      if (!response.ok || !payload?.ok || !payload.data?.bucket) {
        throw new Error(apiErrorMessage(payload, "Failed to create bucket."));
      }

      const { buckets: nextBuckets, scrollTargetBucketId } = applyCreatedBucket(
        bucketsRef.current,
        payload.data.bucket
      );
      setCollections(nextBuckets, trashedBucketsRef.current);
      setPendingScrollBucketId(scrollTargetBucketId);
    } catch (error) {
      setPageError(error instanceof Error ? error.message : "Failed to create bucket.");
    }
  };

  const moveBucketToTrashAction = async (bucketId: string) => {
    setBucketActionState(bucketId, (current) => ({ ...current, trashing: true }));
    setPageError("");

    try {
      const response = await fetch(`/api/buckets/${bucketId}/trash`, { method: "POST" });
      const payload = await readApiResponse<{
        bucket?: Bucket;
        buckets?: Bucket[];
        trashedBuckets?: Bucket[];
      }>(response);
      if (!response.ok || !payload?.ok) {
        throw new Error(apiErrorMessage(payload, "Failed to move bucket to trash."));
      }

      const appliedCollections = applyBucketCollectionsFromPayload(payload.data);
      if (!appliedCollections && payload.data?.bucket) {
        const nextCollections = applyMoveToTrash(
          { buckets: bucketsRef.current, trashedBuckets: trashedBucketsRef.current },
          payload.data.bucket
        );
        setCollections(nextCollections.buckets, nextCollections.trashedBuckets);
      }
    } catch (error) {
      setPageError(error instanceof Error ? error.message : "Failed to move bucket to trash.");
    } finally {
      setBucketActionState(bucketId, (current) => ({ ...current, trashing: false }));
    }
  };

  const restoreBucketAction = async (bucketId: string) => {
    setBucketActionState(bucketId, (current) => ({ ...current, restoring: true }));
    setPageError("");

    try {
      const response = await fetch(`/api/buckets/${bucketId}/restore`, { method: "POST" });
      const payload = await readApiResponse<{
        bucket?: Bucket;
        buckets?: Bucket[];
        trashedBuckets?: Bucket[];
      }>(response);
      if (!response.ok || !payload?.ok) {
        throw new Error(apiErrorMessage(payload, "Failed to restore bucket."));
      }

      const appliedCollections = applyBucketCollectionsFromPayload(payload.data);
      if (!appliedCollections && payload.data?.bucket) {
        const nextCollections = applyRestoreFromTrash(
          { buckets: bucketsRef.current, trashedBuckets: trashedBucketsRef.current },
          payload.data.bucket
        );
        setCollections(nextCollections.buckets, nextCollections.trashedBuckets);
      }
    } catch (error) {
      setPageError(error instanceof Error ? error.message : "Failed to restore bucket.");
    } finally {
      setBucketActionState(bucketId, (current) => ({ ...current, restoring: false }));
    }
  };

  const permanentlyDeleteBucketAction = async (bucketId: string) => {
    setBucketActionState(bucketId, (current) => ({ ...current, deleting: true }));
    setPageError("");

    try {
      const response = await fetch(`/api/buckets/${bucketId}`, { method: "DELETE" });
      const payload = await readApiResponse<{
        deletedBucketId?: string;
        buckets?: Bucket[];
        trashedBuckets?: Bucket[];
      }>(response);
      if (!response.ok || !payload?.ok) {
        throw new Error(apiErrorMessage(payload, "Failed to permanently delete bucket."));
      }

      const deletedBucketId = payload.data?.deletedBucketId ?? bucketId;
      const appliedCollections = applyBucketCollectionsFromPayload(payload.data);
      if (!appliedCollections) {
        const nextCollections = applyPermanentDelete(
          { buckets: bucketsRef.current, trashedBuckets: trashedBucketsRef.current },
          deletedBucketId
        );
        setCollections(nextCollections.buckets, nextCollections.trashedBuckets);
      }
    } catch (error) {
      setPageError(error instanceof Error ? error.message : "Failed to permanently delete bucket.");
    } finally {
      setBucketActionState(bucketId, (current) => ({ ...current, deleting: false }));
    }
  };

  const goAllBuckets = async () => {
    setIsRunningGoAll(true);
    setPageError("");
    setSummaryMessage("");
    setGoAllSummary(null);
    try {
      const response = await fetch("/api/buckets/go-all", { method: "POST" });
      const payload = await readApiResponse<{ summary?: GoAllSummary; buckets?: Bucket[] }>(
        response
      );
      if (!response.ok || !payload?.ok || !payload.data) {
        throw new Error(apiErrorMessage(payload, "Go All failed."));
      }

      if (Array.isArray(payload.data.buckets)) {
        setCollections(payload.data.buckets, trashedBucketsRef.current);
      }
      if (payload.data.summary) {
        setGoAllSummary(payload.data.summary);
        setSummaryMessage(
          `Go All complete: ${payload.data.summary.succeeded} succeeded, ${payload.data.summary.failed} failed.`
        );
      }
      await loadRuntimeHealth();
    } catch (error) {
      setPageError(error instanceof Error ? error.message : "Go All failed.");
    } finally {
      setIsRunningGoAll(false);
    }
  };

  const readyCount = buckets.filter((bucket) => bucket.status === "READY").length;
  const doneCount = buckets.filter((bucket) => bucket.status === "DONE").length;
  const failedCount = buckets.filter((bucket) => bucket.status === "FAILED").length;
  const trashCount = trashedBuckets.length;

  const statsCards = [
    {
      label: "Ready",
      value: readyCount,
      icon: Clock,
      badge: "badge-green",
      color: "text-green-700",
      border: "border-green-600/20",
      bg: "bg-green-600/10",
    },
    {
      label: "Done",
      value: doneCount,
      icon: CheckCircle2,
      badge: "badge-gold",
      color: "text-[#C47A2C]",
      border: "border-[#C47A2C]/20",
      bg: "bg-[#C47A2C]/10",
    },
    {
      label: "Failed",
      value: failedCount,
      icon: XCircle,
      badge: "badge-red",
      color: "text-red-600",
      border: "border-red-400/20",
      bg: "bg-red-400/10",
    },
    {
      label: "Trash",
      value: trashCount,
      icon: Trash2,
      badge: "",
      color: "text-[#2B1B12]/60",
      border: "border-[#2B1B12]/[0.08]",
      bg: "bg-white/40",
    },
    {
      label: "AI",
      value: runtimeHealth.openaiConfigured ? "Live" : "Missing",
      icon: Zap,
      badge: runtimeHealth.openaiConfigured ? "badge-purple" : "",
      color: runtimeHealth.openaiConfigured ? "text-purple-600" : "text-[#2B1B12]/40",
      border: runtimeHealth.openaiConfigured ? "border-purple-400/20" : "border-[#2B1B12]/[0.06]",
      bg: runtimeHealth.openaiConfigured ? "bg-purple-400/10" : "bg-white/40",
    },
  ];

  return (
    <div className="w-full space-y-6">
      <motion.section
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45 }}
        className="warm-card rounded-3xl p-6"
      >
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#2B1B12]/30">
              Launch Console
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-[#2B1B12]">
              FlowCart Dashboard
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-[#2B1B12]/45">
              Build a bucket, upload product assets, enhance with AI, then run GO to
              create a Shopify product and Instagram post through live integrations.
            </p>
          </div>
          <div className="flex flex-col gap-3">
            <button
              type="button"
              onClick={createBucketAction}
              disabled={isRunningGoAll}
              className="inline-flex items-center justify-center gap-2 rounded-2xl border border-[#2B1B12]/10 bg-white/60 px-4 py-2.5 text-sm font-semibold text-[#2B1B12]/70 transition hover:bg-white/80 hover:text-[#2B1B12] disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Plus size={16} /> Create Bucket
            </button>
            <button
              type="button"
              onClick={goAllBuckets}
              disabled={readyCount === 0 || isRunningGoAll}
              className="btn-warm inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-2.5 text-sm disabled:cursor-not-allowed disabled:opacity-60"
            >
              <span className="flex items-center gap-2">
                {isRunningGoAll ? (
                  <><Loader2 size={16} className="animate-spin" /> Running...</>
                ) : (
                  <><Rocket size={16} /> GO ALL ({readyCount})</>
                )}
              </span>
            </button>
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-5">
          {statsCards.map((card) => {
            const Icon = card.icon;
            return (
              <div
                key={card.label}
                className={`rounded-2xl border ${card.border} ${card.bg} px-4 py-3 ${card.badge}`}
              >
                <div className="flex items-center gap-2">
                  <Icon size={14} className={card.color} />
                  <p className="text-xs font-semibold uppercase tracking-wide text-[#2B1B12]/40">
                    {card.label}
                  </p>
                </div>
                <p className={`mt-1 text-xl font-semibold ${card.color}`}>{card.value}</p>
              </div>
            );
          })}
        </div>
      </motion.section>

      {loading ? (
        <div className="flex items-center gap-2 rounded-2xl border border-[#2B1B12]/[0.06] bg-white/50 px-4 py-3">
          <Loader2 size={14} className="animate-spin text-[#C47A2C]" />
          <span className="text-sm text-[#2B1B12]/45">Loading buckets...</span>
        </div>
      ) : null}

      {summaryMessage ? (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl border border-green-600/20 bg-green-600/10 px-4 py-3 text-sm text-green-700"
        >
          {summaryMessage}
          {goAllSummary ? ` (${goAllSummary.total} processed)` : ""}
        </motion.div>
      ) : null}

      {pageError ? (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-600"
        >
          {pageError}
        </motion.div>
      ) : null}

      {buckets.length === 0 && !loading ? (
        <div className="warm-card rounded-3xl p-8 text-center">
          <p className="text-sm text-[#2B1B12]/40">
            No buckets yet. Create your first bucket to start the launch flow.
          </p>
        </div>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-2">
        {buckets.map((bucket, index) => (
          <ProductBucket
            key={bucket.id}
            bucket={bucket}
            bucketNumber={index + 1}
            isSaving={actionsByBucket[bucket.id]?.saving ?? false}
            isUploading={actionsByBucket[bucket.id]?.uploading ?? false}
            isEnhancingTitle={actionsByBucket[bucket.id]?.enhancingTitle ?? false}
            isEnhancingDescription={actionsByBucket[bucket.id]?.enhancingDescription ?? false}
            isLaunching={actionsByBucket[bucket.id]?.launching ?? false}
            isTrashing={actionsByBucket[bucket.id]?.trashing ?? false}
            isDeleting={actionsByBucket[bucket.id]?.deleting ?? false}
            isHighlighted={highlightedBucketId === bucket.id}
            isGlobalBusy={isRunningGoAll}
            containerRef={registerBucketRef(bucket.id)}
            onLocalFieldChange={updateLocalFieldValue}
            onPersistField={persistField}
            onImagesChange={uploadImages}
            onEnhanceTitle={(bucketId) =>
              runBucketAction(bucketId, "enhance-title", "enhancingTitle", "Title enhancement failed.")
            }
            onEnhanceDescription={(bucketId) =>
              runBucketAction(
                bucketId,
                "enhance-description",
                "enhancingDescription",
                "Description enhancement failed."
              )
            }
            onGo={(bucketId) => runBucketAction(bucketId, "go", "launching", "Launch failed.")}
            onMoveToTrash={moveBucketToTrashAction}
            onDeletePermanently={permanentlyDeleteBucketAction}
          />
        ))}
      </div>

      <motion.section
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.24, delay: 0.05 }}
        className="warm-card rounded-3xl p-5"
      >
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-[#2B1B12]">Trash</h2>
            <p className="text-xs text-[#2B1B12]/35">
              Failed buckets stay recoverable here for 30 days.
            </p>
          </div>
          <span className="rounded-full border border-[#2B1B12]/10 bg-white/70 px-3 py-1 text-xs font-semibold text-[#2B1B12]/55">
            {trashCount} item{trashCount === 1 ? "" : "s"}
          </span>
        </div>

        {trashedBuckets.length === 0 ? (
          <p className="rounded-2xl border border-[#2B1B12]/[0.06] bg-white/50 px-4 py-3 text-sm text-[#2B1B12]/40">
            No trashed buckets.
          </p>
        ) : (
          <div className="space-y-3">
            {trashedBuckets.map((bucket, index) => {
              const label = bucket.titleEnhanced.trim() || bucket.titleRaw.trim() || `Bucket #${index + 1}`;
              const trashedDate = bucket.trashedAt ? trashDateFormatter.format(new Date(bucket.trashedAt)) : "Unknown";
              const daysRemaining = getTrashDaysRemaining(bucket.deleteAfterAt);

              return (
                <div
                  key={`trash-${bucket.id}`}
                  data-trash-bucket-id={bucket.id}
                  className="rounded-2xl border border-[#2B1B12]/10 bg-white/70 p-4"
                >
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div className="space-y-1">
                      <p className="text-sm font-semibold text-[#2B1B12]">{label}</p>
                      <p className="text-xs text-[#2B1B12]/40">Bucket ID: {bucket.id}</p>
                      <p className="text-xs text-[#2B1B12]/45">
                        Trashed: {trashedDate} · {daysRemaining} day{daysRemaining === 1 ? "" : "s"} remaining
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        data-testid={`trash-restore-${bucket.id}`}
                        onClick={() => restoreBucketAction(bucket.id)}
                        disabled={actionsByBucket[bucket.id]?.restoring || isRunningGoAll}
                        className="inline-flex items-center gap-2 rounded-xl border border-green-600/25 bg-green-600/10 px-3 py-2 text-sm font-semibold text-green-700 transition hover:bg-green-600/20 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {actionsByBucket[bucket.id]?.restoring ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : (
                          <RotateCcw size={14} />
                        )}
                        Restore
                      </button>
                      <button
                        type="button"
                        data-testid={`trash-delete-${bucket.id}`}
                        onClick={() => permanentlyDeleteBucketAction(bucket.id)}
                        disabled={actionsByBucket[bucket.id]?.deleting || isRunningGoAll}
                        className="inline-flex items-center gap-2 rounded-xl border border-red-500/35 bg-red-500/10 px-3 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {actionsByBucket[bucket.id]?.deleting ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : (
                          <Trash2 size={14} />
                        )}
                        Delete Permanently
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </motion.section>
    </div>
  );
}
