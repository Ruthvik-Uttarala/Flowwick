"use client";

import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useAuth } from "@/src/context/AuthContext";
import { ProductBucket } from "@/src/components/ProductBucket";
import { apiErrorMessage, readApiResponse } from "@/src/components/api-response";
import {
  Plus,
  Rocket,
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  Zap,
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
}

interface RuntimeHealth {
  airiaMode: "live" | "missing" | "unknown";
  settingsConfigured: boolean;
}

const EMPTY_ACTION_STATE: BucketActionState = {
  saving: false,
  uploading: false,
  enhancingTitle: false,
  enhancingDescription: false,
  launching: false,
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
  const [actionsByBucket, setActionsByBucket] = useState<Record<string, BucketActionState>>(
    {}
  );
  const [runtimeHealth, setRuntimeHealth] = useState<RuntimeHealth>({
    airiaMode: "unknown",
    settingsConfigured: false,
  });
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState("");
  const [summaryMessage, setSummaryMessage] = useState("");
  const [goAllSummary, setGoAllSummary] = useState<GoAllSummary | null>(null);
  const [isRunningGoAll, setIsRunningGoAll] = useState(false);

  const setBucketActionState = (
    bucketId: string,
    updater: (current: BucketActionState) => BucketActionState
  ) => {
    setActionsByBucket((current) => ({
      ...current,
      [bucketId]: updater(current[bucketId] ?? EMPTY_ACTION_STATE),
    }));
  };

  const upsertBucket = (nextBucket: Bucket) => {
    setBuckets((current) => {
      const exists = current.some((bucket) => bucket.id === nextBucket.id);
      if (!exists) {
        return [...current, nextBucket];
      }
      return current.map((bucket) => (bucket.id === nextBucket.id ? nextBucket : bucket));
    });
  };

  const loadBuckets = useCallback(async () => {
    const response = await fetch("/api/buckets", { cache: "no-store" });
    const payload = await readApiResponse<{ buckets?: Bucket[] }>(response);
    if (!response.ok || !payload?.ok) {
      throw new Error(apiErrorMessage(payload, "Failed to load buckets."));
    }

    const nextBuckets = Array.isArray(payload.data?.buckets) ? payload.data.buckets : [];
    setBuckets(nextBuckets);
    return nextBuckets;
  }, []);

  const loadRuntimeHealth = useCallback(async () => {
    try {
      const response = await fetch("/api/health", { cache: "no-store" });
      const payload = await readApiResponse<{
        airiaMode?: string;
        settings?: { configured?: boolean };
      }>(response);
      if (!response.ok || !payload?.ok) {
        throw new Error("Failed to load runtime health.");
      }

      setRuntimeHealth({
        airiaMode:
          payload.data?.airiaMode === "live" || payload.data?.airiaMode === "missing"
            ? payload.data.airiaMode
            : "unknown",
        settingsConfigured: Boolean(payload.data?.settings?.configured),
      });
    } catch {
      setRuntimeHealth({ airiaMode: "unknown", settingsConfigured: false });
    }
  }, []);

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
        <Loader2 size={24} className="animate-spin text-white/40" />
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
    setBuckets((current) =>
      current.map((bucket) =>
        bucket.id === bucketId ? { ...bucket, [field]: value } : bucket
      )
    );
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
      upsertBucket(payload.data.bucket);
    } catch (error) {
      setPageError(error instanceof Error ? error.message : "Failed to create bucket.");
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
        setBuckets(payload.data.buckets);
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

  const statsCards = [
    {
      label: "Ready",
      value: readyCount,
      icon: Clock,
      glow: "glow-green",
      color: "text-emerald-400",
      border: "border-emerald-400/20",
      bg: "bg-emerald-400/10",
    },
    {
      label: "Done",
      value: doneCount,
      icon: CheckCircle2,
      glow: "glow-gold",
      color: "text-amber-400",
      border: "border-amber-400/20",
      bg: "bg-amber-400/10",
    },
    {
      label: "Failed",
      value: failedCount,
      icon: XCircle,
      glow: "glow-red",
      color: "text-rose-400",
      border: "border-rose-400/20",
      bg: "bg-rose-400/10",
    },
    {
      label: "Airia",
      value: runtimeHealth.airiaMode === "live" ? "Live" : "Missing",
      icon: Zap,
      glow: runtimeHealth.airiaMode === "live" ? "glow-purple" : "",
      color: runtimeHealth.airiaMode === "live" ? "text-purple-400" : "text-white/40",
      border: runtimeHealth.airiaMode === "live" ? "border-purple-400/20" : "border-white/[0.06]",
      bg: runtimeHealth.airiaMode === "live" ? "bg-purple-400/10" : "bg-white/[0.03]",
    },
  ];

  return (
    <div className="w-full space-y-6">
      <motion.section
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45 }}
        className="glass-card rounded-3xl p-6"
      >
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-white/30">
              Launch Console
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white">
              FlowCart Dashboard
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-white/40">
              Build a bucket, upload product assets, enhance with Airia, then run GO to
              create a Shopify product and Instagram post through live integrations.
            </p>
          </div>
          <div className="flex flex-col gap-3">
            <button
              type="button"
              onClick={createBucketAction}
              disabled={isRunningGoAll}
              className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm font-semibold text-white/70 backdrop-blur-sm transition hover:bg-white/[0.08] hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Plus size={16} /> Create Bucket
            </button>
            <button
              type="button"
              onClick={goAllBuckets}
              disabled={readyCount === 0 || isRunningGoAll}
              className="btn-gradient inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-2.5 text-sm disabled:cursor-not-allowed disabled:opacity-60"
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

        <div className="mt-5 grid gap-3 sm:grid-cols-4">
          {statsCards.map((card) => {
            const Icon = card.icon;
            return (
              <div
                key={card.label}
                className={`rounded-2xl border ${card.border} ${card.bg} px-4 py-3 ${card.glow}`}
              >
                <div className="flex items-center gap-2">
                  <Icon size={14} className={card.color} />
                  <p className="text-xs font-semibold uppercase tracking-wide text-white/40">
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
        <div className="flex items-center gap-2 rounded-2xl border border-white/[0.06] bg-white/[0.03] px-4 py-3">
          <Loader2 size={14} className="animate-spin text-white/40" />
          <span className="text-sm text-white/40">Loading buckets...</span>
        </div>
      ) : null}

      {summaryMessage ? (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-400"
        >
          {summaryMessage}
          {goAllSummary ? ` (${goAllSummary.total} processed)` : ""}
        </motion.div>
      ) : null}

      {pageError ? (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-400"
        >
          {pageError}
        </motion.div>
      ) : null}

      {buckets.length === 0 && !loading ? (
        <div className="glass-card rounded-3xl p-8 text-center">
          <p className="text-sm text-white/40">
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
            isGlobalBusy={isRunningGoAll}
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
          />
        ))}
      </div>
    </div>
  );
}
