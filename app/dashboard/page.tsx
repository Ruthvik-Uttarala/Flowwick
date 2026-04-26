"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, Loader2, Plus, Send, Sparkles, XCircle } from "lucide-react";
import { useAuth } from "@/src/context/AuthContext";
import { PostDetailDrawer } from "@/src/components/PostDetailDrawer";
import { PostTile } from "@/src/components/PostTile";
import { ProductBucket } from "@/src/components/ProductBucket";
import { apiErrorMessage, readApiResponse } from "@/src/components/api-response";
import { LiquidButton } from "@/src/components/ui/liquid-glass-button";
import {
  applyCreatedBucket,
  applyMoveToTrash,
  applyPermanentDelete,
  getBucketPollIntervalMs,
  hasActiveBucketWork,
  markBucketsProcessingForGoAll,
  pickGoAllReadyBucketIds,
  runBoundedQueue,
  upsertBucketById,
} from "@/src/lib/dashboard-buckets";
import {
  isDoneBucketCollapsedByDefault,
  toggleDoneBucketExpandedState,
} from "@/src/lib/bucket-ui";
import type {
  ApiResponseShape,
  DoneBucketSyncPayload,
  EditableBucketField,
  GoAllSummary,
  ProductBucket as Bucket,
  SyncStatusChip,
} from "@/src/lib/types";

interface BucketActionState {
  saving: boolean;
  uploading: boolean;
  enhancingTitle: boolean;
  enhancingDescription: boolean;
  launching: boolean;
  trashing: boolean;
  deleting: boolean;
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
  syncingDone: false,
};

const GO_ALL_CONCURRENCY_LIMIT = 3;
const BUCKET_HASH_PREFIX = "#bucket-";

function bucketFromError(
  payload: ApiResponseShape<unknown> | null | undefined
): Bucket | null {
  const data = payload?.data;
  if (!data || typeof data !== "object") {
    return null;
  }
  return (data as { bucket?: Bucket }).bucket ?? null;
}

function hasSyncPayloadChanges(payload: DoneBucketSyncPayload): boolean {
  return Object.keys(payload).length > 0;
}

function statusLabel(status: Bucket["status"]): string {
  switch (status) {
    case "DONE":
      return "Posted";
    case "READY":
      return "Ready";
    case "FAILED":
      return "Issues";
    case "PROCESSING":
    case "ENHANCING":
      return "Working";
    default:
      return "Draft";
  }
}

function parseBucketIdFromHash(hash: string): string {
  if (!hash.startsWith(BUCKET_HASH_PREFIX)) {
    return "";
  }
  return hash.slice(BUCKET_HASH_PREFIX.length).trim();
}

export default function DashboardPage() {
  const { user, loading: authLoading } = useAuth();

  const [buckets, setBuckets] = useState<Bucket[]>([]);
  const [actionsByBucket, setActionsByBucket] = useState<
    Record<string, BucketActionState>
  >({});
  const [doneExpandedByBucketId, setDoneExpandedByBucketId] = useState<
    Record<string, boolean>
  >({});
  const [doneSyncChips, setDoneSyncChips] = useState<
    Record<string, SyncStatusChip[]>
  >({});
  const [runtimeHealth, setRuntimeHealth] = useState<RuntimeHealth>({
    openaiConfigured: false,
    settingsConfigured: false,
  });

  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState("");
  const [summaryMessage, setSummaryMessage] = useState("");
  const [goAllSummary, setGoAllSummary] = useState<GoAllSummary | null>(null);
  const [isRunningGoAll, setIsRunningGoAll] = useState(false);
  const [openBucketId, setOpenBucketId] = useState("");
  const [highlightedBucketId, setHighlightedBucketId] = useState("");

  const bucketsRef = useRef<Bucket[]>([]);
  const trashedBucketsRef = useRef<Bucket[]>([]);
  const goAllInFlightRef = useRef(false);
  const highlightTimeoutRef = useRef<number | null>(null);

  const setBucketActionState = (
    bucketId: string,
    updater: (current: BucketActionState) => BucketActionState
  ) => {
    setActionsByBucket((current) => ({
      ...current,
      [bucketId]: updater(current[bucketId] ?? EMPTY_ACTION_STATE),
    }));
  };

  const setCollections = useCallback(
    (nextBuckets: Bucket[], nextTrashedBuckets: Bucket[]) => {
      bucketsRef.current = nextBuckets;
      trashedBucketsRef.current = nextTrashedBuckets;
      setBuckets(nextBuckets);

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
    },
    []
  );

  const applyBucketCollectionsFromPayload = useCallback(
    (payload: { buckets?: Bucket[]; trashedBuckets?: Bucket[] } | undefined) => {
      const hasBuckets = Array.isArray(payload?.buckets);
      const hasTrashed = Array.isArray(payload?.trashedBuckets);
      if (!hasBuckets && !hasTrashed) {
        return false;
      }

      const nextBuckets = hasBuckets ? payload?.buckets ?? [] : bucketsRef.current;
      const nextTrashed = hasTrashed
        ? payload?.trashedBuckets ?? []
        : trashedBucketsRef.current;
      setCollections(nextBuckets, nextTrashed);
      return true;
    },
    [setCollections]
  );

  const upsertBucket = (nextBucket: Bucket) => {
    const nextBuckets = upsertBucketById(bucketsRef.current, nextBucket);
    setCollections(nextBuckets, trashedBucketsRef.current);
  };

  const highlightBucket = useCallback((bucketId: string) => {
    if (!bucketId) {
      return;
    }
    setHighlightedBucketId(bucketId);
    if (highlightTimeoutRef.current) {
      window.clearTimeout(highlightTimeoutRef.current);
    }
    highlightTimeoutRef.current = window.setTimeout(() => {
      setHighlightedBucketId((current) => (current === bucketId ? "" : current));
    }, 1400);
  }, []);

  const setHashForBucket = useCallback((bucketId: string) => {
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${window.location.search}#bucket-${bucketId}`
    );
  }, []);

  const clearBucketHash = useCallback(() => {
    if (window.location.hash.startsWith(BUCKET_HASH_PREFIX)) {
      window.history.replaceState(
        null,
        "",
        `${window.location.pathname}${window.location.search}`
      );
    }
  }, []);

  const openBucket = useCallback(
    (bucketId: string, syncHash = true) => {
      setOpenBucketId(bucketId);
      highlightBucket(bucketId);
      if (syncHash) {
        setHashForBucket(bucketId);
      }
    },
    [highlightBucket, setHashForBucket]
  );

  const closeBucket = useCallback(() => {
    setOpenBucketId("");
    clearBucketHash();
  }, [clearBucketHash]);

  const loadBuckets = useCallback(async () => {
    const response = await fetch("/api/buckets", { cache: "no-store" });
    const payload = await readApiResponse<{
      buckets?: Bucket[];
      trashedBuckets?: Bucket[];
    }>(response);
    if (!response.ok || !payload?.ok) {
      throw new Error(apiErrorMessage(payload, "Failed to load posts."));
    }

    const nextBuckets = Array.isArray(payload.data?.buckets)
      ? payload.data.buckets
      : [];
    const nextTrashed = Array.isArray(payload.data?.trashedBuckets)
      ? payload.data.trashedBuckets
      : [];
    setCollections(nextBuckets, nextTrashed);
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

  useEffect(() => {
    if (authLoading || !user) {
      return;
    }

    let active = true;
    const initialize = async () => {
      setLoading(true);
      setPageError("");
      try {
        await Promise.all([loadBuckets(), loadRuntimeHealth()]);
      } catch (error) {
        if (active) {
          setPageError(
            error instanceof Error ? error.message : "Failed to load posts."
          );
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    void initialize();
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
        console.warn("[flowcart:dashboard] polling failed", error);
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

  useEffect(() => {
    return () => {
      if (highlightTimeoutRef.current) {
        window.clearTimeout(highlightTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!openBucketId) {
      return;
    }
    const exists = buckets.some((bucket) => bucket.id === openBucketId);
    if (!exists) {
      setOpenBucketId("");
      clearBucketHash();
    }
  }, [buckets, openBucketId, clearBucketHash]);

  useEffect(() => {
    if (loading || buckets.length === 0) {
      return;
    }

    const openFromHash = () => {
      const bucketId = parseBucketIdFromHash(window.location.hash);
      if (!bucketId) {
        return;
      }
      if (buckets.some((bucket) => bucket.id === bucketId)) {
        openBucket(bucketId, false);
      }
    };

    openFromHash();
    window.addEventListener("hashchange", openFromHash);
    return () => {
      window.removeEventListener("hashchange", openFromHash);
    };
  }, [loading, buckets, openBucket]);

  if (authLoading) {
    return (
      <div className="flex w-full items-center justify-center py-20">
        <Loader2
          size={24}
          className="animate-spin text-[color:var(--fc-text-muted)]"
        />
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
    const target = bucketsRef.current.find((bucket) => bucket.id === bucketId);
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
        throw new Error(apiErrorMessage(payload, "Failed to save post."));
      }
      upsertBucket(payload.data.bucket);
    } catch (error) {
      setPageError(error instanceof Error ? error.message : "Failed to save post.");
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
        throw new Error(apiErrorMessage(payload, "Photo upload failed."));
      }
      upsertBucket(payload.data.bucket);
    } catch (error) {
      setPageError(
        error instanceof Error ? error.message : "Photo upload failed."
      );
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
      const response = await fetch(`/api/buckets/${bucketId}/${path}`, {
        method: "POST",
      });
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
        throw new Error(apiErrorMessage(payload, "Failed to create post."));
      }

      const { buckets: nextBuckets, scrollTargetBucketId } = applyCreatedBucket(
        bucketsRef.current,
        payload.data.bucket
      );
      setCollections(nextBuckets, trashedBucketsRef.current);
      openBucket(scrollTargetBucketId || payload.data.bucket.id);
    } catch (error) {
      setPageError(
        error instanceof Error ? error.message : "Failed to create post."
      );
    }
  };

  const moveBucketToTrashAction = async (bucketId: string) => {
    setBucketActionState(bucketId, (current) => ({ ...current, trashing: true }));
    setPageError("");

    try {
      const response = await fetch(`/api/buckets/${bucketId}/trash`, {
        method: "POST",
      });
      const payload = await readApiResponse<{
        bucket?: Bucket;
        buckets?: Bucket[];
        trashedBuckets?: Bucket[];
      }>(response);
      if (!response.ok || !payload?.ok) {
        throw new Error(apiErrorMessage(payload, "Failed to move post to trash."));
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
      setPageError(
        error instanceof Error ? error.message : "Failed to move post to trash."
      );
    } finally {
      setBucketActionState(bucketId, (current) => ({ ...current, trashing: false }));
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
        throw new Error(apiErrorMessage(payload, "Failed to delete post."));
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
      setPageError(error instanceof Error ? error.message : "Failed to delete post.");
    } finally {
      setBucketActionState(bucketId, (current) => ({ ...current, deleting: false }));
    }
  };

  const syncDoneBucketAction = async (
    bucketId: string,
    patch: DoneBucketSyncPayload
  ) => {
    if (!hasSyncPayloadChanges(patch)) {
      setDoneSyncChips((current) => ({
        ...current,
        [bucketId]: [
          {
            id: "sync-no-op",
            label: "No changes",
            tone: "warning",
            detail: "Edit at least one field before updating the post.",
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
        sync?: { chips?: SyncStatusChip[] };
      }>(response);

      if (!response.ok || !payload?.ok || !payload.data?.bucket) {
        throw new Error(apiErrorMessage(payload, "Failed to update post."));
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
                  label: "Post updated",
                  tone: "success",
                  detail: "Your post was updated everywhere.",
                },
              ],
      }));
    } catch (error) {
      setDoneSyncChips((current) => ({
        ...current,
        [bucketId]: [
          {
            id: "sync-failed",
            label: "Update failed",
            tone: "failure",
            detail: error instanceof Error ? error.message : "Failed to update post.",
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
    setSummaryMessage(`Posting: 0/${targetBucketIds.length} done.`);

    const nextBuckets = markBucketsProcessingForGoAll(
      bucketsRef.current,
      targetBucketIds
    );
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
        setSummaryMessage(`Posting: ${completed}/${targetBucketIds.length} done.`);
      } else {
        setSummaryMessage(
          `Done. ${succeeded} posted, ${failed} need attention. (${targetBucketIds.length} total)`
        );
      }
    };

    try {
      await runBoundedQueue(targetBucketIds, GO_ALL_CONCURRENCY_LIMIT, async (bucketId) => {
        try {
          const response = await fetch(`/api/buckets/${bucketId}/go`, {
            method: "POST",
          });
          const payload = await readApiResponse<{ bucket?: Bucket }>(response);

          if (payload?.data?.bucket) {
            upsertBucket(payload.data.bucket);
          }

          if (!response.ok || !payload?.ok) {
            const message = apiErrorMessage(payload, "Posting failed.");
            const currentBucket = bucketsRef.current.find(
              (bucket) => bucket.id === bucketId
            );
            if (currentBucket) {
              upsertBucket({
                ...currentBucket,
                status: "FAILED",
                errorMessage: message,
              });
            }
          }

          const completedBucket =
            payload?.data?.bucket ??
            bucketsRef.current.find((item) => item.id === bucketId);
          if (completedBucket?.status === "DONE") {
            succeeded += 1;
          } else {
            failed += 1;
          }
        } catch (error) {
          failed += 1;
          const currentBucket = bucketsRef.current.find(
            (bucket) => bucket.id === bucketId
          );
          if (currentBucket) {
            upsertBucket({
              ...currentBucket,
              status: "FAILED",
              errorMessage: error instanceof Error ? error.message : "Posting failed.",
            });
          }
        } finally {
          completed += 1;
          reportProgress();
        }
      });
      await loadRuntimeHealth();
    } catch (error) {
      setPageError(error instanceof Error ? error.message : "Posting failed.");
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

  const selectedBucket = buckets.find((bucket) => bucket.id === openBucketId) ?? null;
  const selectedBucketIndex = selectedBucket
    ? buckets.findIndex((bucket) => bucket.id === selectedBucket.id)
    : -1;

  const statusStrip = [
    {
      label: "Ready",
      value: `${readyCount}`,
      icon: CheckCircle2,
      className: "text-[color:var(--fc-text-primary)]",
    },
    {
      label: "Posted",
      value: `${doneCount}`,
      icon: CheckCircle2,
      className: "text-[#15803d]",
    },
    {
      label: "Issues",
      value: `${failedCount}`,
      icon: XCircle,
      className: "text-[#b42318]",
    },
    {
      label: "AI",
      value: runtimeHealth.openaiConfigured ? "On" : "Off",
      icon: Sparkles,
      className: runtimeHealth.openaiConfigured
        ? "text-[#15803d]"
        : "text-[color:var(--fc-text-muted)]",
    },
  ];

  return (
    <div className="w-full space-y-4">
      <motion.section
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.26 }}
        className="space-y-3"
      >
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-[color:var(--fc-text-primary)]">
              Your Posts
            </h1>
            <p className="mt-1 text-sm text-[color:var(--fc-text-muted)]">
              Create once. Share to Shopify and Instagram.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <LiquidButton
              onClick={createBucketAction}
              disabled={isRunningGoAll}
              variant="primary"
              size="md"
            >
              <Plus size={14} />
              Create
            </LiquidButton>
            {readyCount > 0 ? (
              <LiquidButton
                onClick={goAllBuckets}
                disabled={readyCount === 0 || isRunningGoAll}
                variant="secondary"
                size="md"
              >
                {isRunningGoAll ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Send size={14} />
                )}
                Post All ({readyCount})
              </LiquidButton>
            ) : null}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 rounded-xl border border-[color:var(--fc-border-subtle)] bg-white p-2 sm:grid-cols-4">
          {statusStrip.map((item) => {
            const Icon = item.icon;
            return (
              <div
                key={item.label}
                className="flex items-center gap-2 rounded-lg border border-[color:var(--fc-border-subtle)] bg-[color:var(--fc-surface-muted)] px-3 py-2"
              >
                <Icon size={14} className={item.className} />
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[color:var(--fc-text-soft)]">
                    {item.label}
                  </p>
                  <p className="text-sm font-semibold text-[color:var(--fc-text-primary)]">
                    {item.value}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </motion.section>

      <AnimatePresence initial={false}>
        {loading ? (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="flex items-center gap-2 rounded-lg border border-[color:var(--fc-border-subtle)] bg-white px-4 py-3 text-sm text-[color:var(--fc-text-muted)]"
          >
            <Loader2 size={14} className="animate-spin" />
            Loading posts...
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence initial={false}>
        {summaryMessage ? (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="rounded-lg border border-[color:var(--fc-border-subtle)] bg-white px-4 py-3 text-sm text-[color:var(--fc-text-primary)]"
          >
            <div className="flex flex-wrap items-center gap-2">
              <span>{summaryMessage}</span>
              {goAllSummary ? (
                <span className="rounded-full border border-[color:var(--fc-border-subtle)] bg-[color:var(--fc-surface-muted)] px-2 py-0.5 text-[11px] font-semibold text-[color:var(--fc-text-muted)]">
                  Posted {goAllSummary.succeeded} • Issues {goAllSummary.failed}
                </span>
              ) : null}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence initial={false}>
        {pageError ? (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="rounded-lg border border-[rgba(220,38,38,0.3)] bg-[rgba(220,38,38,0.06)] px-4 py-3 text-sm text-[#b42318]"
          >
            {pageError}
          </motion.div>
        ) : null}
      </AnimatePresence>

      {buckets.length === 0 && !loading ? (
        <div className="rounded-2xl border border-[color:var(--fc-border-subtle)] bg-white px-6 py-14 text-center">
          <div className="mx-auto mb-3 inline-flex h-12 w-12 items-center justify-center rounded-full bg-[color:var(--fc-surface-muted)]">
            <Plus
              size={20}
              strokeWidth={1.9}
              className="text-[color:var(--fc-text-muted)]"
            />
          </div>
          <h3 className="text-base font-semibold text-[color:var(--fc-text-primary)]">
            No posts yet
          </h3>
          <p className="mx-auto mt-1 max-w-xs text-sm text-[color:var(--fc-text-muted)]">
            Create your first post to upload images and publish.
          </p>
          <div className="mt-4 flex justify-center">
            <LiquidButton
              onClick={createBucketAction}
              disabled={isRunningGoAll}
              variant="primary"
              size="md"
            >
              <Plus size={14} />
              Create
            </LiquidButton>
          </div>
        </div>
      ) : null}

      {buckets.length > 0 ? (
        <section className="w-full rounded-xl border border-[color:var(--fc-border-subtle)] bg-white p-1.5 sm:p-2">
          <div className="grid grid-cols-3 gap-1.5 sm:gap-2">
            {buckets.map((bucket, index) => (
              <PostTile
                key={bucket.id}
                bucket={bucket}
                bucketNumber={index + 1}
                isHighlighted={highlightedBucketId === bucket.id}
                onOpen={(bucketId) => openBucket(bucketId)}
              />
            ))}
          </div>
        </section>
      ) : null}

      <PostDetailDrawer
        isOpen={Boolean(selectedBucket)}
        onClose={closeBucket}
        title={selectedBucket ? `${statusLabel(selectedBucket.status)} post` : "Post"}
      >
        {selectedBucket ? (
          <div className="p-3 sm:p-4">
            <ProductBucket
              bucket={selectedBucket}
              bucketNumber={selectedBucketIndex >= 0 ? selectedBucketIndex + 1 : 1}
              isSaving={actionsByBucket[selectedBucket.id]?.saving ?? false}
              isUploading={actionsByBucket[selectedBucket.id]?.uploading ?? false}
              isEnhancingTitle={
                actionsByBucket[selectedBucket.id]?.enhancingTitle ?? false
              }
              isEnhancingDescription={
                actionsByBucket[selectedBucket.id]?.enhancingDescription ?? false
              }
              isLaunching={actionsByBucket[selectedBucket.id]?.launching ?? false}
              isTrashing={actionsByBucket[selectedBucket.id]?.trashing ?? false}
              isDeleting={actionsByBucket[selectedBucket.id]?.deleting ?? false}
              isDoneExpanded={
                isDoneBucketCollapsedByDefault(selectedBucket.status)
                  ? Boolean(doneExpandedByBucketId[selectedBucket.id])
                  : true
              }
              isSyncingDone={actionsByBucket[selectedBucket.id]?.syncingDone ?? false}
              doneSyncChips={doneSyncChips[selectedBucket.id] ?? []}
              isHighlighted={highlightedBucketId === selectedBucket.id}
              isGlobalBusy={isRunningGoAll}
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
              onGo={(bucketId) =>
                runBucketAction(bucketId, "go", "launching", "Post failed.")
              }
              onMoveToTrash={moveBucketToTrashAction}
              onDeletePermanently={permanentlyDeleteBucketAction}
              onToggleDoneExpanded={toggleDoneBucketExpanded}
              onSyncDone={syncDoneBucketAction}
            />
          </div>
        ) : null}
      </PostDetailDrawer>
    </div>
  );
}
