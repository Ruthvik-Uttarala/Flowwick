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
  markBucketsProcessingForGoAll,
  pickGoAllReadyBucketIds,
  applyPermanentDelete,
  applyRestoreFromTrash,
  getBucketPollIntervalMs,
  getTrashDaysRemaining,
  hasActiveBucketWork,
  runBoundedQueue,
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
  SyncStatusChip,
} from "@/src/lib/types";
import {
  isDoneBucketCollapsedByDefault,
  toggleDoneBucketExpandedState,
} from "@/src/lib/bucket-ui";
import { LiquidButton } from "@/src/components/ui/liquid-glass-button";
import { WebGLShader } from "@/src/components/ui/web-gl-shader";

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

const GO_ALL_CONCURRENCY_LIMIT = 3;

export default function DashboardPage() {
  const { user, loading: authLoading } = useAuth();
  const [buckets, setBuckets] = useState<Bucket[]>([]);
  const [trashedBuckets, setTrashedBuckets] = useState<Bucket[]>([]);
  const [actionsByBucket, setActionsByBucket] = useState<Record<string, BucketActionState>>({});
  const [doneExpandedByBucketId, setDoneExpandedByBucketId] = useState<Record<string, boolean>>({});
  const [doneSyncChips, setDoneSyncChips] = useState<Record<string, SyncStatusChip[]>>({});
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
  const goAllInFlightRef = useRef(false);

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
    setDoneSyncChips((current) => {
      const pruned: Record<string, SyncStatusChip[]> = {};
      for (const [bucketId, chips] of Object.entries(current)) {
        if (activeIds.has(bucketId)) {
          pruned[bucketId] = chips;
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

  const hasActiveProcessingBuckets = useMemo(
    () => hasActiveBucketWork(buckets),
    [buckets]
  );
  const shouldAutoRefreshBuckets = isRunningGoAll || hasActiveProcessingBuckets;

  useEffect(() => {
    if (authLoading || !user || !shouldAutoRefreshBuckets) {
      return;
    }

    let cancelled = false;
    let timeoutId: number | null = null;

    const pollOnce = async () => {
      if (cancelled) {
        return;
      }

      try {
        await loadBuckets();
      } catch (error) {
        console.warn("[flowcart:dashboard] bucket polling failed", error);
      } finally {
        if (!cancelled) {
          timeoutId = window.setTimeout(() => {
            void pollOnce();
          }, getBucketPollIntervalMs(isRunningGoAll));
        }
      }
    };

    timeoutId = window.setTimeout(() => {
      void pollOnce();
    }, getBucketPollIntervalMs(isRunningGoAll));

    return () => {
      cancelled = true;
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [authLoading, user, shouldAutoRefreshBuckets, isRunningGoAll, loadBuckets]);

  if (authLoading) {
    return (
      <div className="flex w-full items-center justify-center py-20">
        <Loader2 size={24} className="animate-spin text-[color:var(--fc-primary)]" />
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
      setDoneSyncChips((current) => ({
        ...current,
        [bucketId]: [
          {
            id: "sync-no-op",
            label: "No changes",
            tone: "warning",
            detail: "Edit at least one field before syncing updates.",
          },
        ],
      }));
      return;
    }

    setBucketActionState(bucketId, (current) => ({ ...current, syncingDone: true }));
    setPageError("");
    setDoneSyncChips((current) => ({ ...current, [bucketId]: [] }));

    try {
      const response = await fetch(`/api/buckets/${bucketId}/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const payload = await readApiResponse<{
        bucket?: Bucket;
        sync?: {
          chips?: SyncStatusChip[];
        };
      }>(response);

      if (!response.ok || !payload?.ok || !payload.data?.bucket) {
        throw new Error(apiErrorMessage(payload, "Failed to sync launched bucket."));
      }

      upsertBucket(payload.data.bucket);
      setDoneSyncChips((current) => ({
        ...current,
        [bucketId]:
          payload.data?.sync?.chips && payload.data.sync.chips.length > 0
            ? payload.data.sync.chips
            : [
                {
                  id: "sync-complete",
                  label: "Sync complete",
                  tone: "success",
                  detail: "Done bucket updates were synced.",
                },
              ],
      }));
    } catch (error) {
      setDoneSyncChips((current) => ({
        ...current,
        [bucketId]: [
          {
            id: "sync-failed",
            label: "Sync failed",
            tone: "failure",
            detail: error instanceof Error ? error.message : "Failed to sync launched bucket.",
          },
        ],
      }));
    } finally {
      setBucketActionState(bucketId, (current) => ({ ...current, syncingDone: false }));
    }
  };

  const goAllBuckets = async () => {
    if (goAllInFlightRef.current) {
      return;
    }

    const targetBucketIds = pickGoAllReadyBucketIds(bucketsRef.current);
    if (targetBucketIds.length === 0) {
      return;
    }

    goAllInFlightRef.current = true;
    setIsRunningGoAll(true);
    setPageError("");
    setGoAllSummary({
      total: targetBucketIds.length,
      succeeded: 0,
      failed: 0,
      bucketIds: targetBucketIds,
    });
    setSummaryMessage(`GO ALL running: 0/${targetBucketIds.length} completed.`);

    const nextBuckets = markBucketsProcessingForGoAll(bucketsRef.current, targetBucketIds);
    setCollections(nextBuckets, trashedBucketsRef.current);

    let succeeded = 0;
    let failed = 0;
    let completed = 0;

    const reportProgress = () => {
      setGoAllSummary({
        total: targetBucketIds.length,
        succeeded,
        failed,
        bucketIds: targetBucketIds,
      });

      if (completed < targetBucketIds.length) {
        setSummaryMessage(`GO ALL running: ${completed}/${targetBucketIds.length} completed.`);
      } else {
        setSummaryMessage(
          `Go All complete: ${succeeded} succeeded, ${failed} failed. (${targetBucketIds.length} processed)`
        );
      }
    };

    try {
      await runBoundedQueue(targetBucketIds, GO_ALL_CONCURRENCY_LIMIT, async (bucketId) => {
        try {
          const response = await fetch(`/api/buckets/${bucketId}/go`, { method: "POST" });
          const payload = await readApiResponse<{ bucket?: Bucket }>(response);

          if (payload?.data?.bucket) {
            upsertBucket(payload.data.bucket);
          }

          if (!response.ok || !payload?.ok) {
            const message = apiErrorMessage(payload, "Launch failed.");
            const currentBucket = bucketsRef.current.find((bucket) => bucket.id === bucketId);
            if (currentBucket) {
              upsertBucket({
                ...currentBucket,
                status: "FAILED",
                errorMessage: message,
              });
            }
          }

          const completedBucket = payload?.data?.bucket ?? bucketsRef.current.find((b) => b.id === bucketId);
          if (completedBucket?.status === "DONE") {
            succeeded += 1;
          } else {
            failed += 1;
          }
        } catch (error) {
          failed += 1;
          const currentBucket = bucketsRef.current.find((bucket) => bucket.id === bucketId);
          if (currentBucket) {
            upsertBucket({
              ...currentBucket,
              status: "FAILED",
              errorMessage: error instanceof Error ? error.message : "Launch failed.",
            });
          }
        } finally {
          completed += 1;
          reportProgress();
        }
      });
      await loadRuntimeHealth();
    } catch (error) {
      setPageError(error instanceof Error ? error.message : "Go All failed.");
    } finally {
      setIsRunningGoAll(false);
      goAllInFlightRef.current = false;
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
      accent: "border-[color:rgba(15,108,189,0.22)] bg-[rgba(15,108,189,0.1)] text-[color:#0d4f8a]",
    },
    {
      label: "Done",
      value: doneCount,
      icon: CheckCircle2,
      accent: "border-[color:rgba(18,122,89,0.24)] bg-[rgba(18,122,89,0.1)] text-[color:#0c5e45]",
    },
    {
      label: "Failed",
      value: failedCount,
      icon: XCircle,
      accent: "border-[color:rgba(194,65,58,0.26)] bg-[rgba(194,65,58,0.1)] text-[color:#942a26]",
    },
    {
      label: "Trash",
      value: trashCount,
      icon: Trash2,
      accent: "border-[color:rgba(15,108,189,0.14)] bg-white/92 text-[color:var(--fc-text-primary)]",
    },
    {
      label: "AI",
      value: runtimeHealth.openaiConfigured ? "Live" : "Missing",
      icon: Zap,
      accent: runtimeHealth.openaiConfigured
        ? "border-[color:rgba(15,108,189,0.28)] bg-[rgba(15,108,189,0.12)] text-[color:#0d4f8a]"
        : "border-[color:rgba(15,108,189,0.14)] bg-white/92 text-[color:var(--fc-text-muted)]",
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
        <WebGLShader className="opacity-55" />
        <div className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-[rgba(76,200,255,0.2)] blur-3xl" />
        <div className="pointer-events-none absolute -left-20 -bottom-24 h-60 w-60 rounded-full bg-[rgba(106,84,209,0.14)] blur-3xl" />

        <div className="relative z-10 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[color:rgba(19,26,34,0.56)]">
              Launch Console
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-[color:var(--fc-text-primary)]">
              FlowCart Dashboard
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-[color:var(--fc-text-muted)]">
              Build once, launch everywhere, and edit launched buckets without duplicate Shopify
              products or duplicate Instagram posts.
            </p>
          </div>
          <div className="flex flex-col gap-3">
            <LiquidButton
              onClick={createBucketAction}
              disabled={isRunningGoAll}
              variant="secondary"
              className="rounded-2xl"
            >
              <Plus size={16} /> Create Bucket
            </LiquidButton>
            <LiquidButton
              onClick={goAllBuckets}
              disabled={readyCount === 0 || isRunningGoAll}
              size="lg"
              className="rounded-2xl"
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
            </LiquidButton>
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
            className="flex items-center gap-2 rounded-2xl border border-[color:rgba(15,108,189,0.14)] bg-white/84 px-4 py-3"
          >
            <Loader2 size={14} className="animate-spin text-[color:var(--fc-primary)]" />
            <span className="text-sm text-[color:var(--fc-text-muted)]">Loading buckets...</span>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence initial={false}>
        {summaryMessage ? (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="rounded-2xl border border-[color:rgba(15,108,189,0.18)] bg-white px-4 py-3 text-sm text-[color:var(--fc-text-primary)]"
          >
            <div className="flex flex-wrap items-center gap-2">
              <span>{summaryMessage}</span>
              {goAllSummary ? (
                <span className="rounded-full border border-[color:rgba(15,108,189,0.16)] bg-white/85 px-2.5 py-0.5 text-[11px] font-semibold tracking-wide text-[color:rgba(19,26,34,0.7)]">
                  Success {goAllSummary.succeeded} · Failed {goAllSummary.failed}
                </span>
              ) : null}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence initial={false}>
        {pageError ? (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="rounded-2xl border border-[color:rgba(194,65,58,0.34)] bg-[rgba(194,65,58,0.1)] px-4 py-3 text-sm text-[color:#942a26]"
          >
            {pageError}
          </motion.div>
        ) : null}
      </AnimatePresence>

      {buckets.length === 0 && !loading ? (
        <div className="cinematic-card rounded-3xl p-8 text-center">
          <p className="text-sm text-[color:var(--fc-text-muted)]">
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
                  doneSyncChips={doneSyncChips[bucket.id] ?? []}
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
            <h2 className="text-lg font-semibold text-[color:var(--fc-text-primary)]">Trash</h2>
            <p className="text-xs text-[color:var(--fc-text-muted)]">
              Empty and failed buckets stay recoverable here for 30 days.
            </p>
          </div>
          <span className="rounded-full border border-[color:rgba(15,108,189,0.14)] bg-white/82 px-3 py-1 text-xs font-semibold text-[color:var(--fc-text-muted)]">
            {trashCount} item{trashCount === 1 ? "" : "s"}
          </span>
        </div>

        {trashedBuckets.length === 0 ? (
          <p className="rounded-2xl border border-[color:rgba(15,108,189,0.14)] bg-white/82 px-4 py-3 text-sm text-[color:var(--fc-text-muted)]">
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
                    className="rounded-2xl border border-[color:rgba(15,108,189,0.14)] bg-white/88 p-4"
                  >
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                      <div className="space-y-1">
                        <p className="text-sm font-semibold text-[color:var(--fc-text-primary)]">{label}</p>
                        <p className="text-xs text-[color:var(--fc-text-muted)]">Bucket ID: {bucket.id}</p>
                        <p className="text-xs text-[color:var(--fc-text-muted)]">
                          Trashed: {trashedDate} · {daysRemaining} day
                          {daysRemaining === 1 ? "" : "s"} remaining
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <LiquidButton
                          data-testid={`trash-restore-${bucket.id}`}
                          onClick={() => restoreBucketAction(bucket.id)}
                          disabled={actionsByBucket[bucket.id]?.restoring || isRunningGoAll}
                          variant="secondary"
                          size="sm"
                          className="rounded-2xl"
                        >
                          {actionsByBucket[bucket.id]?.restoring ? (
                            <Loader2 size={14} className="animate-spin" />
                          ) : (
                            <RotateCcw size={14} />
                          )}
                          Restore
                        </LiquidButton>
                        <LiquidButton
                          data-testid={`trash-delete-${bucket.id}`}
                          onClick={() => permanentlyDeleteBucketAction(bucket.id)}
                          disabled={actionsByBucket[bucket.id]?.deleting || isRunningGoAll}
                          variant="danger"
                          size="sm"
                          className="rounded-2xl"
                        >
                          {actionsByBucket[bucket.id]?.deleting ? (
                            <Loader2 size={14} className="animate-spin" />
                          ) : (
                            <Trash2 size={14} />
                          )}
                          Delete Permanently
                        </LiquidButton>
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
