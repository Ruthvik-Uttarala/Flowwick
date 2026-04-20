"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AnimatePresence, motion } from "framer-motion";
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
  CheckCircle2,
  Clock,
  Loader2,
  Plus,
  Rocket,
  RotateCcw,
  Trash2,
  XCircle,
  Zap,
} from "lucide-react";
import type {
  ApiResponseShape,
  DoneBucketSyncPayload,
  EditableBucketField,
  GoAllSummary,
  ProductBucket as Bucket,
} from "@/src/lib/types";
import {
  isDoneBucketCollapsedByDefault,
  toggleDoneBucketExpandedState,
} from "@/src/lib/bucket-ui";

interface BucketActionState {
  saving: boolean;
  uploading: boolean;
  enhancingTitle: boolean;
  enhancingDescription: boolean;
  launching: boolean;
  trashing: boolean;
  deleting: boolean;
  restoring: boolean;
  syncingDone: boolean;
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
  syncingDone: false,
};

function bucketFromError(payload: ApiResponseShape<unknown> | null | undefined): Bucket | null {
  const data = payload?.data;
  if (!data || typeof data !== "object") {
    return null;
  }
  return (data as { bucket?: Bucket }).bucket ?? null;
}

function hasSyncPayloadChanges(payload: DoneBucketSyncPayload): boolean {
  return Object.keys(payload).length > 0;
}

export default function DashboardPage() {
  const { user, loading: authLoading } = useAuth();
  const [buckets, setBuckets] = useState<Bucket[]>([]);
  const [trashedBuckets, setTrashedBuckets] = useState<Bucket[]>([]);
  const [actionsByBucket, setActionsByBucket] = useState<Record<string, BucketActionState>>({});
  const [doneExpandedByBucketId, setDoneExpandedByBucketId] = useState<Record<string, boolean>>({});
  const [doneSyncMessages, setDoneSyncMessages] = useState<Record<string, string>>({});
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
    const activeIds = new Set(nextBuckets.map((bucket) => bucket.id));
    setDoneExpandedByBucketId((current) => {
      const pruned: Record<string, boolean> = {};
      for (const [bucketId, expanded] of Object.entries(current)) {
        if (activeIds.has(bucketId)) {
          pruned[bucketId] = expanded;
        }
      }
      return pruned;
    });
    setDoneSyncMessages((current) => {
      const pruned: Record<string, string> = {};
      for (const [bucketId, message] of Object.entries(current)) {
        if (activeIds.has(bucketId)) {
          pruned[bucketId] = message;
        }
      }
      return pruned;
    });
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
        <Loader2 size={24} className="animate-spin text-amber-200" />
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

  const syncDoneBucketAction = async (bucketId: string, patch: DoneBucketSyncPayload) => {
    if (!hasSyncPayloadChanges(patch)) {
      setDoneSyncMessages((current) => ({
        ...current,
        [bucketId]: "No field changes to sync.",
      }));
      return;
    }

    setBucketActionState(bucketId, (current) => ({ ...current, syncingDone: true }));
    setPageError("");
    setDoneSyncMessages((current) => ({ ...current, [bucketId]: "" }));

    try {
      const response = await fetch(`/api/buckets/${bucketId}/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const payload = await readApiResponse<{
        bucket?: Bucket;
        sync?: { instagramOutcome?: string };
        message?: string;
      }>(response);

      if (!response.ok || !payload?.ok || !payload.data?.bucket) {
        throw new Error(apiErrorMessage(payload, "Failed to sync launched bucket."));
      }

      upsertBucket(payload.data.bucket);
      setDoneSyncMessages((current) => ({
        ...current,
        [bucketId]:
          payload.data?.message ??
          (payload.data?.sync?.instagramOutcome === "updated"
            ? "Done bucket synced successfully."
            : "Done bucket synced."),
      }));
    } catch (error) {
      setDoneSyncMessages((current) => ({
        ...current,
        [bucketId]: error instanceof Error ? error.message : "Failed to sync launched bucket.",
      }));
    } finally {
      setBucketActionState(bucketId, (current) => ({ ...current, syncingDone: false }));
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

  const toggleDoneBucketExpanded = (bucketId: string) => {
    setDoneExpandedByBucketId((current) =>
      toggleDoneBucketExpandedState(current, bucketId)
    );
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
      accent: "border-emerald-300/25 bg-emerald-400/14 text-emerald-100",
    },
    {
      label: "Done",
      value: doneCount,
      icon: CheckCircle2,
      accent: "border-amber-300/25 bg-amber-300/14 text-amber-100",
    },
    {
      label: "Failed",
      value: failedCount,
      icon: XCircle,
      accent: "border-red-300/25 bg-red-500/16 text-red-100",
    },
    {
      label: "Trash",
      value: trashCount,
      icon: Trash2,
      accent: "border-white/12 bg-white/6 text-amber-50/80",
    },
    {
      label: "AI",
      value: runtimeHealth.openaiConfigured ? "Live" : "Missing",
      icon: Zap,
      accent: runtimeHealth.openaiConfigured
        ? "border-violet-300/25 bg-violet-400/14 text-violet-100"
        : "border-white/12 bg-white/6 text-amber-50/80",
    },
  ];

  return (
    <div className="w-full space-y-6">
      <motion.section
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="cinematic-card relative overflow-hidden rounded-3xl p-6"
      >
        <div className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-amber-300/12 blur-3xl" />
        <div className="pointer-events-none absolute -left-20 -bottom-24 h-60 w-60 rounded-full bg-red-400/8 blur-3xl" />

        <div className="relative z-10 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-amber-50/40">
              Launch Console
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-amber-50">
              FlowCart Dashboard
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-amber-50/65">
              Build, launch, and now refine live buckets in-place. DONE buckets stay compact until
              you choose to edit, and launched sync avoids duplicate Shopify products or duplicate
              Instagram posts.
            </p>
          </div>
          <div className="flex flex-col gap-3">
            <button
              type="button"
              onClick={createBucketAction}
              disabled={isRunningGoAll}
              className="inline-flex items-center justify-center gap-2 rounded-2xl border border-amber-100/20 bg-white/8 px-4 py-2.5 text-sm font-semibold text-amber-50/80 transition hover:bg-white/15 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
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
                  <>
                    <Loader2 size={16} className="animate-spin" /> Running...
                  </>
                ) : (
                  <>
                    <Rocket size={16} /> GO ALL ({readyCount})
                  </>
                )}
              </span>
            </button>
          </div>
        </div>

        <div className="relative z-10 mt-5 grid gap-3 sm:grid-cols-5">
          {statsCards.map((card, index) => {
            const Icon = card.icon;
            return (
              <motion.div
                key={card.label}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: 0.04 * index }}
                className={`rounded-2xl border px-4 py-3 ${card.accent}`}
              >
                <div className="flex items-center gap-2">
                  <Icon size={14} />
                  <p className="text-xs font-semibold uppercase tracking-wide opacity-70">
                    {card.label}
                  </p>
                </div>
                <p className="mt-1 text-xl font-semibold">{card.value}</p>
              </motion.div>
            );
          })}
        </div>
      </motion.section>

      <AnimatePresence initial={false}>
        {loading ? (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/6 px-4 py-3"
          >
            <Loader2 size={14} className="animate-spin text-amber-100" />
            <span className="text-sm text-amber-50/70">Loading buckets...</span>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence initial={false}>
        {summaryMessage ? (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="rounded-2xl border border-emerald-300/25 bg-emerald-500/12 px-4 py-3 text-sm text-emerald-100"
          >
            {summaryMessage}
            {goAllSummary ? ` (${goAllSummary.total} processed)` : ""}
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence initial={false}>
        {pageError ? (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="rounded-2xl border border-red-300/25 bg-red-500/14 px-4 py-3 text-sm text-red-100"
          >
            {pageError}
          </motion.div>
        ) : null}
      </AnimatePresence>

      {buckets.length === 0 && !loading ? (
        <div className="cinematic-card rounded-3xl p-8 text-center">
          <p className="text-sm text-amber-50/65">
            No buckets yet. Create your first bucket to start the launch flow.
          </p>
        </div>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-2">
        <AnimatePresence initial={false}>
          {buckets.map((bucket, index) => {
            const isDoneCollapsed = isDoneBucketCollapsedByDefault(bucket.status);
            const isDoneExpanded = isDoneCollapsed
              ? Boolean(doneExpandedByBucketId[bucket.id])
              : true;

            return (
              <motion.div
                layout
                key={bucket.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
              >
                <ProductBucket
                  bucket={bucket}
                  bucketNumber={index + 1}
                  isSaving={actionsByBucket[bucket.id]?.saving ?? false}
                  isUploading={actionsByBucket[bucket.id]?.uploading ?? false}
                  isEnhancingTitle={actionsByBucket[bucket.id]?.enhancingTitle ?? false}
                  isEnhancingDescription={actionsByBucket[bucket.id]?.enhancingDescription ?? false}
                  isLaunching={actionsByBucket[bucket.id]?.launching ?? false}
                  isTrashing={actionsByBucket[bucket.id]?.trashing ?? false}
                  isDeleting={actionsByBucket[bucket.id]?.deleting ?? false}
                  isDoneExpanded={isDoneExpanded}
                  isSyncingDone={actionsByBucket[bucket.id]?.syncingDone ?? false}
                  doneSyncMessage={doneSyncMessages[bucket.id] ?? ""}
                  isHighlighted={highlightedBucketId === bucket.id}
                  isGlobalBusy={isRunningGoAll}
                  containerRef={registerBucketRef(bucket.id)}
                  onLocalFieldChange={updateLocalFieldValue}
                  onPersistField={persistField}
                  onImagesChange={uploadImages}
                  onEnhanceTitle={(bucketId) =>
                    runBucketAction(
                      bucketId,
                      "enhance-title",
                      "enhancingTitle",
                      "Title enhancement failed."
                    )
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
                  onToggleDoneExpanded={toggleDoneBucketExpanded}
                  onSyncDone={syncDoneBucketAction}
                />
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      <motion.section
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.05 }}
        className="cinematic-card rounded-3xl p-5"
      >
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-amber-50">Trash</h2>
            <p className="text-xs text-amber-50/50">
              Empty and failed buckets stay recoverable here for 30 days.
            </p>
          </div>
          <span className="rounded-full border border-amber-100/20 bg-white/8 px-3 py-1 text-xs font-semibold text-amber-50/75">
            {trashCount} item{trashCount === 1 ? "" : "s"}
          </span>
        </div>

        {trashedBuckets.length === 0 ? (
          <p className="rounded-2xl border border-white/10 bg-white/6 px-4 py-3 text-sm text-amber-50/55">
            No trashed buckets.
          </p>
        ) : (
          <div className="space-y-3">
            <AnimatePresence initial={false}>
              {trashedBuckets.map((bucket, index) => {
                const label =
                  bucket.titleEnhanced.trim() || bucket.titleRaw.trim() || `Bucket #${index + 1}`;
                const trashedDate = bucket.trashedAt
                  ? trashDateFormatter.format(new Date(bucket.trashedAt))
                  : "Unknown";
                const daysRemaining = getTrashDaysRemaining(bucket.deleteAfterAt);

                return (
                  <motion.div
                    key={`trash-${bucket.id}`}
                    layout
                    data-trash-bucket-id={bucket.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    className="rounded-2xl border border-amber-100/16 bg-white/8 p-4"
                  >
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                      <div className="space-y-1">
                        <p className="text-sm font-semibold text-amber-50">{label}</p>
                        <p className="text-xs text-amber-50/50">Bucket ID: {bucket.id}</p>
                        <p className="text-xs text-amber-50/60">
                          Trashed: {trashedDate} · {daysRemaining} day
                          {daysRemaining === 1 ? "" : "s"} remaining
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          data-testid={`trash-restore-${bucket.id}`}
                          onClick={() => restoreBucketAction(bucket.id)}
                          disabled={actionsByBucket[bucket.id]?.restoring || isRunningGoAll}
                          className="inline-flex items-center gap-2 rounded-xl border border-emerald-300/25 bg-emerald-500/14 px-3 py-2 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-500/24 disabled:cursor-not-allowed disabled:opacity-60"
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
                          className="inline-flex items-center gap-2 rounded-xl border border-red-400/40 bg-red-500/18 px-3 py-2 text-sm font-semibold text-red-100 transition hover:bg-red-500/28 disabled:cursor-not-allowed disabled:opacity-60"
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
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}
      </motion.section>
    </div>
  );
}
