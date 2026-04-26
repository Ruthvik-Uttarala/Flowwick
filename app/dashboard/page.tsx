"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  CheckCircle2,
  CircleAlert,
  Loader2,
  Plus,
  Send,
  Sparkles,
} from "lucide-react";
import { useAuth } from "@/src/context/AuthContext";
import { ProductBucket } from "@/src/components/ProductBucket";
import { PostTile } from "@/src/components/PostTile";
import { PostDetailDrawer } from "@/src/components/PostDetailDrawer";
import { apiErrorMessage, readApiResponse } from "@/src/components/api-response";
import {
  applyCreatedBucket,
  applyMoveToTrash,
  applyPermanentDelete,
  getBucketPollIntervalMs,
  hasActiveBucketWork,
  upsertBucketById,
} from "@/src/lib/dashboard-buckets";
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
  const [doneSyncChips, setDoneSyncChips] = useState<Record<string, SyncStatusChip[]>>({});
  const [runtimeHealth, setRuntimeHealth] = useState<RuntimeHealth>({ openaiConfigured: false });
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState("");
  const [summaryMessage, setSummaryMessage] = useState("");
  const [goAllSummary, setGoAllSummary] = useState<GoAllSummary | null>(null);
  const [isRunningGoAll, setIsRunningGoAll] = useState(false);
  const [highlightedBucketId, setHighlightedBucketId] = useState("");
  const [openBucketId, setOpenBucketId] = useState<string>("");
  const [pendingScrollBucketId, setPendingScrollBucketId] = useState("");

  const tileRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const bucketsRef = useRef<Bucket[]>([]);
  const trashedBucketsRef = useRef<Bucket[]>([]);
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

    if (openBucketId && !nextBuckets.some((bucket) => bucket.id === openBucketId)) {
      setOpenBucketId("");
    }
  }, [openBucketId]);

  const upsertBucket = useCallback((nextBucket: Bucket) => {
    const nextBuckets = upsertBucketById(bucketsRef.current, nextBucket);
    setCollections(nextBuckets, trashedBucketsRef.current);
  }, [setCollections]);

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

  const loadBuckets = useCallback(async () => {
    const response = await fetch("/api/buckets", { cache: "no-store" });
    const payload = await readApiResponse<{ buckets?: Bucket[]; trashedBuckets?: Bucket[] }>(response);
    if (!response.ok || !payload?.ok) {
      throw new Error(apiErrorMessage(payload, "Failed to load posts."));
    }

    setCollections(
      Array.isArray(payload.data?.buckets) ? payload.data.buckets : [],
      Array.isArray(payload.data?.trashedBuckets) ? payload.data.trashedBuckets : []
    );
  }, [setCollections]);

  const loadRuntimeHealth = useCallback(async () => {
    try {
      const response = await fetch("/api/health", { cache: "no-store" });
      const payload = await readApiResponse<{ openaiConfigured?: boolean }>(response);
      if (!response.ok || !payload?.ok) {
        throw new Error("Runtime health unavailable.");
      }

      setRuntimeHealth({
        openaiConfigured: Boolean(payload.data?.openaiConfigured),
      });
    } catch {
      setRuntimeHealth({ openaiConfigured: false });
    }
  }, []);

  const showBucketHighlight = useCallback((bucketId: string) => {
    setHighlightedBucketId(bucketId);
    if (highlightTimeoutRef.current) {
      window.clearTimeout(highlightTimeoutRef.current);
    }
    highlightTimeoutRef.current = window.setTimeout(() => {
      setHighlightedBucketId((current) => (current === bucketId ? "" : current));
    }, 1600);
  }, []);

  const registerTileRef = useCallback(
    (bucketId: string) => (element: HTMLDivElement | null) => {
      tileRefs.current[bucketId] = element;
    },
    []
  );

  const openBucket = useCallback(
    (bucketId: string) => {
      setOpenBucketId(bucketId);
      showBucketHighlight(bucketId);
      const target = tileRefs.current[bucketId];
      if (target) {
        target.scrollIntoView({ behavior: "smooth", block: "center" });
      }
      window.history.replaceState(null, "", `#bucket-${bucketId}`);
    },
    [showBucketHighlight]
  );

  const openBucketFromHash = useCallback(() => {
    const rawHash = typeof window !== "undefined" ? window.location.hash : "";
    const bucketId = rawHash.startsWith("#bucket-") ? rawHash.slice("#bucket-".length) : "";
    if (!bucketId) {
      return;
    }

    const hasBucket = bucketsRef.current.some((bucket) => bucket.id === bucketId);
    if (!hasBucket) {
      return;
    }

    setOpenBucketId(bucketId);
    showBucketHighlight(bucketId);
    const target = tileRefs.current[bucketId];
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [showBucketHighlight]);

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
          setPageError(error instanceof Error ? error.message : "Failed to load posts.");
        }
      } finally {
        if (active) {
          setLoading(false);
          window.requestAnimationFrame(() => {
            openBucketFromHash();
          });
        }
      }
    };

    void initialize();

    return () => {
      active = false;
    };
  }, [authLoading, user, loadBuckets, loadRuntimeHealth, openBucketFromHash]);

  useEffect(() => {
    if (authLoading || !user) {
      return;
    }

    const onHashChange = () => {
      openBucketFromHash();
    };

    window.addEventListener("hashchange", onHashChange);
    return () => {
      window.removeEventListener("hashchange", onHashChange);
    };
  }, [authLoading, user, openBucketFromHash]);

  useEffect(
    () => () => {
      if (highlightTimeoutRef.current) {
        window.clearTimeout(highlightTimeoutRef.current);
      }
    },
    []
  );

  useEffect(() => {
    if (!pendingScrollBucketId) {
      return;
    }

    const target = tileRefs.current[pendingScrollBucketId];
    if (!target) {
      return;
    }

    target.scrollIntoView({ behavior: "smooth", block: "center" });
    showBucketHighlight(pendingScrollBucketId);
    setPendingScrollBucketId("");
  }, [pendingScrollBucketId, buckets, showBucketHighlight]);

  const hasActiveProcessingBuckets = useMemo(() => hasActiveBucketWork(buckets), [buckets]);

  useEffect(() => {
    if (authLoading || !user || (!isRunningGoAll && !hasActiveProcessingBuckets)) {
      return;
    }

    let cancelled = false;
    let timeoutId: number | null = null;

    const poll = async () => {
      if (cancelled) {
        return;
      }

      try {
        await loadBuckets();
      } catch {
        // Keep UI responsive even if polling fails intermittently.
      } finally {
        if (!cancelled) {
          timeoutId = window.setTimeout(poll, getBucketPollIntervalMs(isRunningGoAll));
        }
      }
    };

    timeoutId = window.setTimeout(poll, getBucketPollIntervalMs(isRunningGoAll));

    return () => {
      cancelled = true;
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [authLoading, user, isRunningGoAll, hasActiveProcessingBuckets, loadBuckets]);

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
      setPageError(error instanceof Error ? error.message : "Photo upload failed.");
    } finally {
      setBucketActionState(bucketId, (current) => ({ ...current, uploading: false }));
    }
  };

  const runBucketAction = async (
    bucketId: string,
    path: "enhance-title" | "enhance-description" | "go",
    actionKey: keyof Pick<BucketActionState, "enhancingTitle" | "enhancingDescription" | "launching">,
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
    setSummaryMessage("");
    setGoAllSummary(null);

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
      setPendingScrollBucketId(scrollTargetBucketId);
      openBucket(payload.data.bucket.id);
    } catch (error) {
      setPageError(error instanceof Error ? error.message : "Failed to create post.");
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

      if (openBucketId === bucketId) {
        setOpenBucketId("");
      }
    } catch (error) {
      setPageError(error instanceof Error ? error.message : "Failed to move post to trash.");
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

      if (openBucketId === deletedBucketId) {
        setOpenBucketId("");
      }
    } catch (error) {
      setPageError(error instanceof Error ? error.message : "Failed to delete post.");
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
    const readyIds = bucketsRef.current.filter((bucket) => bucket.status === "READY").map((bucket) => bucket.id);
    if (readyIds.length === 0 || isRunningGoAll) {
      return;
    }

    setIsRunningGoAll(true);
    setPageError("");
    setSummaryMessage("Posting all ready posts...");

    try {
      const response = await fetch("/api/buckets/go-all", { method: "POST" });
      const payload = await readApiResponse<{ summary?: GoAllSummary; buckets?: Bucket[] }>(response);
      if (!response.ok || !payload?.ok) {
        throw new Error(apiErrorMessage(payload, "Post All failed."));
      }

      if (Array.isArray(payload.data?.buckets)) {
        setCollections(payload.data.buckets, trashedBucketsRef.current);
      } else {
        await loadBuckets();
      }

      if (payload.data?.summary) {
        setGoAllSummary(payload.data.summary);
        setSummaryMessage(
          `Done. ${payload.data.summary.succeeded} posted, ${payload.data.summary.failed} need attention.`
        );
      } else {
        setGoAllSummary(null);
        setSummaryMessage("Post All completed.");
      }

      await loadRuntimeHealth();
    } catch (error) {
      setPageError(error instanceof Error ? error.message : "Post All failed.");
    } finally {
      setIsRunningGoAll(false);
    }
  };

  const toggleDoneBucketExpanded = (bucketId: string) => {
    setDoneExpandedByBucketId((current) => toggleDoneBucketExpandedState(current, bucketId));
  };

  const selectedBucket = useMemo(
    () => buckets.find((bucket) => bucket.id === openBucketId) ?? null,
    [buckets, openBucketId]
  );

  const selectedBucketIndex = selectedBucket
    ? Math.max(0, buckets.findIndex((bucket) => bucket.id === selectedBucket.id))
    : -1;

  const readyCount = buckets.filter((bucket) => bucket.status === "READY").length;
  const postedCount = buckets.filter((bucket) => bucket.status === "DONE").length;
  const issuesCount = buckets.filter((bucket) => bucket.status === "FAILED").length;

  if (authLoading) {
    return (
      <div className="flex w-full items-center justify-center py-20">
        <Loader2 size={24} className="animate-spin text-[color:var(--fc-text-muted)]" />
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="w-full space-y-4">
      <section className="rounded-2xl border border-[color:var(--fc-border-subtle)] bg-white p-4 sm:p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-[color:var(--fc-text-primary)] sm:text-[1.9rem]">
              Your Posts
            </h1>
            <p className="mt-1 text-sm text-[color:var(--fc-text-muted)]">
              Create once. Publish to Shopify and Instagram.
            </p>
          </div>
          <div className="grid w-full gap-2 sm:w-auto sm:grid-cols-2">
            <LiquidButton
              onClick={createBucketAction}
              disabled={isRunningGoAll}
              variant="primary"
              size="lg"
              className="h-10"
              contentClassName="inline-flex items-center justify-center gap-2"
            >
              <Plus size={15} />
              Create Post
            </LiquidButton>
            <LiquidButton
              onClick={goAllBuckets}
              disabled={readyCount === 0 || isRunningGoAll}
              variant="secondary"
              size="lg"
              className="h-10"
              contentClassName="inline-flex items-center justify-center gap-2"
            >
              {isRunningGoAll ? (
                <>
                  <Loader2 size={15} className="animate-spin" />
                  Posting...
                </>
              ) : (
                <>
                  <Send size={15} />
                  Post All{readyCount > 0 ? ` (${readyCount})` : ""}
                </>
              )}
            </LiquidButton>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-4 gap-2 sm:gap-3">
          <StatusChip label="Ready" value={`${readyCount}`} icon={<Sparkles size={14} />} />
          <StatusChip label="Posted" value={`${postedCount}`} icon={<CheckCircle2 size={14} />} />
          <StatusChip label="Issues" value={`${issuesCount}`} icon={<CircleAlert size={14} />} />
          <StatusChip label="AI" value={runtimeHealth.openaiConfigured ? "On" : "Off"} icon={<Sparkles size={14} />} />
        </div>
      </section>

      {summaryMessage ? (
        <div className="rounded-xl border border-[color:var(--fc-border-subtle)] bg-white px-4 py-3 text-sm text-[color:var(--fc-text-primary)]">
          <div className="flex flex-wrap items-center gap-2">
            <span>{summaryMessage}</span>
            {goAllSummary ? (
              <span className="rounded-full border border-[color:var(--fc-border-subtle)] bg-[color:var(--fc-surface-muted)] px-2.5 py-0.5 text-[11px] font-semibold text-[color:var(--fc-text-muted)]">
                Posted {goAllSummary.succeeded} · Issues {goAllSummary.failed}
              </span>
            ) : null}
          </div>
        </div>
      ) : null}

      {pageError ? (
        <div className="rounded-xl border border-[rgba(220,38,38,0.3)] bg-[rgba(220,38,38,0.06)] px-4 py-3 text-sm text-[#b91c1c]">
          {pageError}
        </div>
      ) : null}

      {loading ? (
        <div className="flex items-center gap-2 rounded-xl border border-[color:var(--fc-border-subtle)] bg-white px-4 py-3 text-sm text-[color:var(--fc-text-muted)]">
          <Loader2 size={14} className="animate-spin" />
          Loading your posts...
        </div>
      ) : null}

      {!loading && buckets.length === 0 ? (
        <div className="rounded-2xl border border-[color:var(--fc-border-subtle)] bg-white px-6 py-12 text-center">
          <h2 className="text-base font-semibold text-[color:var(--fc-text-primary)]">No posts yet</h2>
          <p className="mx-auto mt-1 max-w-xs text-sm text-[color:var(--fc-text-muted)]">
            Create your first post to publish everywhere.
          </p>
          <div className="mt-4 flex justify-center">
            <LiquidButton onClick={createBucketAction} disabled={isRunningGoAll} variant="primary" size="md">
              <Plus size={15} />
              Create Post
            </LiquidButton>
          </div>
        </div>
      ) : null}

      {!loading && buckets.length > 0 ? (
        <section className="w-full" aria-label="Posts grid">
          <div className="grid grid-cols-3 gap-1 sm:gap-2 md:gap-3">
            {buckets.map((bucket, index) => (
              <div key={bucket.id} ref={registerTileRef(bucket.id)}>
                <PostTile
                  bucket={bucket}
                  bucketNumber={index + 1}
                  isHighlighted={highlightedBucketId === bucket.id}
                  onOpen={openBucket}
                />
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <PostDetailDrawer
        isOpen={Boolean(selectedBucket)}
        onClose={() => setOpenBucketId("")}
        title={selectedBucket ? (selectedBucket.titleEnhanced.trim() || selectedBucket.titleRaw.trim() || `Post ${selectedBucketIndex + 1}`) : "Post details"}
      >
        {selectedBucket ? (
          <div className="px-3 pb-3 pt-2 sm:px-4 sm:pb-4 sm:pt-3">
            <ProductBucket
              bucket={selectedBucket}
              bucketNumber={selectedBucketIndex + 1}
              isSaving={actionsByBucket[selectedBucket.id]?.saving ?? false}
              isUploading={actionsByBucket[selectedBucket.id]?.uploading ?? false}
              isEnhancingTitle={actionsByBucket[selectedBucket.id]?.enhancingTitle ?? false}
              isEnhancingDescription={actionsByBucket[selectedBucket.id]?.enhancingDescription ?? false}
              isLaunching={actionsByBucket[selectedBucket.id]?.launching ?? false}
              isTrashing={actionsByBucket[selectedBucket.id]?.trashing ?? false}
              isDeleting={actionsByBucket[selectedBucket.id]?.deleting ?? false}
              isDoneExpanded={
                isDoneBucketCollapsedByDefault(selectedBucket.status)
                  ? doneExpandedByBucketId[selectedBucket.id] ?? true
                  : true
              }
              isSyncingDone={actionsByBucket[selectedBucket.id]?.syncingDone ?? false}
              doneSyncChips={doneSyncChips[selectedBucket.id] ?? []}
              isHighlighted={false}
              isGlobalBusy={isRunningGoAll}
              onLocalFieldChange={updateLocalFieldValue}
              onPersistField={persistField}
              onImagesChange={uploadImages}
              onEnhanceTitle={(bucketId) =>
                runBucketAction(bucketId, "enhance-title", "enhancingTitle", "Title enhancement failed.")
              }
              onEnhanceDescription={(bucketId) =>
                runBucketAction(bucketId, "enhance-description", "enhancingDescription", "Caption enhancement failed.")
              }
              onGo={(bucketId) => runBucketAction(bucketId, "go", "launching", "Post failed.")}
              onMoveToTrash={moveBucketToTrashAction}
              onDeletePermanently={permanentlyDeleteBucketAction}
              onToggleDoneExpanded={toggleDoneBucketExpanded}
              onSyncDone={syncDoneBucketAction}
            />
          </div>
        ) : null}
      </PostDetailDrawer>

      {trashedBuckets.length > 0 ? (
        <p className="text-center text-xs text-[color:var(--fc-text-muted)]">
          {trashedBuckets.length} removed post{trashedBuckets.length === 1 ? "" : "s"} available in Settings.
        </p>
      ) : null}
    </div>
  );
}

function StatusChip({ label, value, icon }: { label: string; value: string; icon: ReactNode }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-[color:var(--fc-border-subtle)] bg-[color:var(--fc-surface-muted)] px-3 py-2">
      <span className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-[color:var(--fc-border-subtle)] bg-white text-[color:var(--fc-text-primary)]">
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[color:var(--fc-text-soft)]">{label}</p>
        <p className="truncate text-sm font-semibold text-[color:var(--fc-text-primary)]">{value}</p>
      </div>
    </div>
  );
}
