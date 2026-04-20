"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertCircle,
  Camera,
  ChevronDown,
  ExternalLink,
  ImagePlus,
  Loader2,
  PencilLine,
  Rocket,
  ShoppingBag,
  Sparkles,
  Trash2,
} from "lucide-react";
import type {
  DoneBucketSyncPayload,
  EditableBucketField,
  ProductBucket as Bucket,
} from "@/src/lib/types";
import {
  getBucketTrashDescription,
  getBucketTrashLabel,
  shouldShowBucketTrashControl,
} from "@/src/lib/bucket-ui";

interface ProductBucketProps {
  bucket: Bucket;
  bucketNumber: number;
  isSaving: boolean;
  isUploading: boolean;
  isEnhancingTitle: boolean;
  isEnhancingDescription: boolean;
  isLaunching: boolean;
  isGlobalBusy: boolean;
  isDoneExpanded: boolean;
  isSyncingDone: boolean;
  doneSyncMessage: string;
  onLocalFieldChange: (
    bucketId: string,
    field: EditableBucketField,
    value: string | number | null
  ) => void;
  onPersistField: (bucketId: string, field: EditableBucketField) => void;
  onImagesChange: (bucketId: string, files: FileList | null) => void;
  onEnhanceTitle: (bucketId: string) => void;
  onEnhanceDescription: (bucketId: string) => void;
  onGo: (bucketId: string) => void;
  onMoveToTrash: (bucketId: string) => void;
  onDeletePermanently: (bucketId: string) => void;
  onToggleDoneExpanded: (bucketId: string) => void;
  onSyncDone: (bucketId: string, patch: DoneBucketSyncPayload) => void;
  isTrashing: boolean;
  isDeleting: boolean;
  isHighlighted: boolean;
  containerRef?: (element: HTMLElement | null) => void;
}

interface DoneBucketDraftState {
  titleRaw: string;
  descriptionRaw: string;
  quantity: number | null;
  price: number | null;
}

function statusStyle(status: Bucket["status"]): { classes: string; badge: string } {
  if (status === "DONE")
    return {
      classes:
        "border border-amber-300/45 bg-amber-300/10 text-amber-100 shadow-[0_0_24px_rgba(245,158,11,0.22)]",
      badge: "badge-gold",
    };
  if (status === "FAILED")
    return {
      classes:
        "border border-red-300/35 bg-red-400/12 text-red-100 shadow-[0_0_20px_rgba(248,113,113,0.2)]",
      badge: "badge-red",
    };
  if (status === "PROCESSING")
    return {
      classes:
        "border border-sky-300/35 bg-sky-400/12 text-sky-100 shadow-[0_0_20px_rgba(56,189,248,0.25)]",
      badge: "pulse-blue",
    };
  if (status === "ENHANCING")
    return {
      classes:
        "border border-violet-300/35 bg-violet-400/12 text-violet-100 shadow-[0_0_20px_rgba(167,139,250,0.2)]",
      badge: "badge-purple",
    };
  if (status === "READY")
    return {
      classes:
        "border border-emerald-300/35 bg-emerald-400/12 text-emerald-100 shadow-[0_0_20px_rgba(16,185,129,0.2)]",
      badge: "badge-green",
    };

  return {
    classes: "border border-amber-100/15 bg-white/8 text-amber-50/65",
    badge: "",
  };
}

function toDraft(bucket: Bucket): DoneBucketDraftState {
  return {
    titleRaw: bucket.titleRaw,
    descriptionRaw: bucket.descriptionRaw,
    quantity: bucket.quantity,
    price: bucket.price,
  };
}

function draftPatch(
  bucket: Bucket,
  draft: DoneBucketDraftState
): DoneBucketSyncPayload {
  const patch: DoneBucketSyncPayload = {};

  if (bucket.titleRaw !== draft.titleRaw) {
    patch.titleRaw = draft.titleRaw;
  }
  if (bucket.descriptionRaw !== draft.descriptionRaw) {
    patch.descriptionRaw = draft.descriptionRaw;
  }
  if ((bucket.quantity ?? null) !== (draft.quantity ?? null)) {
    patch.quantity = draft.quantity;
  }
  if ((bucket.price ?? null) !== (draft.price ?? null)) {
    patch.price = draft.price;
  }

  return patch;
}

function hasPatchChanges(patch: DoneBucketSyncPayload): boolean {
  return Object.keys(patch).length > 0;
}

function doneBucketHeadline(bucket: Bucket, bucketNumber: number): string {
  return (
    bucket.titleEnhanced.trim() ||
    bucket.titleRaw.trim() ||
    `Bucket ${bucketNumber}`
  );
}

export function ProductBucket({
  bucket,
  bucketNumber,
  isSaving,
  isUploading,
  isEnhancingTitle,
  isEnhancingDescription,
  isLaunching,
  isGlobalBusy,
  isDoneExpanded,
  isSyncingDone,
  doneSyncMessage,
  onLocalFieldChange,
  onPersistField,
  onImagesChange,
  onEnhanceTitle,
  onEnhanceDescription,
  onGo,
  onMoveToTrash,
  onDeletePermanently,
  onToggleDoneExpanded,
  onSyncDone,
  isTrashing,
  isDeleting,
  isHighlighted,
  containerRef,
}: ProductBucketProps) {
  const [confirmingTrash, setConfirmingTrash] = useState(false);
  const [doneDraft, setDoneDraft] = useState<DoneBucketDraftState>(() => toDraft(bucket));

  const donePatch = useMemo(() => draftPatch(bucket, doneDraft), [bucket, doneDraft]);
  const hasDoneChanges = hasPatchChanges(donePatch);
  const isDoneBucket = bucket.status === "DONE";

  useEffect(() => {
    if (!isDoneBucket) {
      return;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDoneDraft(toDraft(bucket));
  }, [bucket, isDoneBucket]);

  const controlsLocked =
    isUploading ||
    isEnhancingTitle ||
    isEnhancingDescription ||
    isLaunching ||
    isTrashing ||
    isDeleting ||
    isGlobalBusy ||
    bucket.status === "PROCESSING" ||
    bucket.status === "ENHANCING";

  const showTrashControl = shouldShowBucketTrashControl(bucket.status);
  const trashLabel = getBucketTrashLabel(bucket.status);
  const trashDescription = getBucketTrashDescription(bucket.status);

  const isEmptyTrash = bucket.status === "EMPTY";
  const trashContainerClass = isEmptyTrash
    ? "border-amber-100/20 bg-white/6"
    : "border-red-300/30 bg-red-500/12";
  const trashPrimaryClass = isEmptyTrash
    ? "border-amber-100/25 bg-white/10 text-amber-50 hover:bg-white/15"
    : "border-red-400/40 bg-red-500/20 text-red-100 hover:bg-red-500/30";
  const trashDescriptionClass = isEmptyTrash ? "text-amber-50/70" : "text-red-100/85";

  const { classes: statusClasses, badge: statusBadge } = statusStyle(bucket.status);
  const inputClass =
    "cinematic-input w-full rounded-2xl px-3 py-2.5 text-sm";

  const doneSummaryTitle = doneBucketHeadline(bucket, bucketNumber);

  if (isDoneBucket && !isDoneExpanded) {
    return (
      <motion.section
        ref={containerRef}
        id={`bucket-${bucket.id}`}
        layout
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.24 }}
        className={`cinematic-card rounded-3xl p-4 sm:p-5 ${
          isHighlighted
            ? "ring-2 ring-amber-300/75 shadow-[0_0_0_6px_rgba(245,158,11,0.14)]"
            : ""
        }`}
      >
        <div className="flex flex-col gap-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] uppercase tracking-[0.22em] text-amber-50/45">
                Bucket {bucketNumber}
              </p>
              <h2 className="mt-1 text-lg font-semibold text-amber-50">{doneSummaryTitle}</h2>
              <p className="mt-1 text-xs text-amber-50/45">Updated {new Date(bucket.updatedAt).toLocaleString()}</p>
            </div>
            <span
              className={`rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-wider ${statusClasses} ${statusBadge}`}
            >
              DONE
            </span>
          </div>

          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              {bucket.imageUrls.slice(0, 3).map((imageUrl) => (
                <div
                  key={`${bucket.id}-thumb-${imageUrl}`}
                  className="h-14 w-14 overflow-hidden rounded-xl border border-amber-100/20 bg-black/30"
                >
                  <Image
                    src={imageUrl}
                    alt="Bucket thumbnail"
                    width={64}
                    height={64}
                    unoptimized
                    className="h-full w-full object-cover"
                  />
                </div>
              ))}
              {bucket.imageUrls.length === 0 ? (
                <span className="rounded-xl border border-amber-100/15 bg-white/6 px-3 py-2 text-xs text-amber-50/55">
                  No images
                </span>
              ) : null}
            </div>
            <button
              type="button"
              data-testid={`bucket-edit-${bucket.id}`}
              onClick={() => onToggleDoneExpanded(bucket.id)}
              className="inline-flex items-center justify-center gap-2 rounded-2xl border border-amber-200/30 bg-amber-300/16 px-4 py-2.5 text-sm font-semibold text-amber-100 transition hover:bg-amber-300/25"
            >
              <PencilLine size={14} />
              Edit
            </button>
          </div>

          <div className="grid gap-2 text-xs sm:grid-cols-2">
            <div className="rounded-xl border border-emerald-300/25 bg-emerald-400/12 px-3 py-2 text-emerald-100/95">
              <div className="mb-1 flex items-center gap-1.5 font-semibold uppercase tracking-wide text-[10px] text-emerald-100/70">
                <ShoppingBag size={12} />
                Shopify
              </div>
              {bucket.shopifyProductUrl ? (
                <a
                  href={bucket.shopifyProductUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex max-w-full items-center gap-1.5 truncate text-emerald-100 hover:text-white"
                >
                  <span className="truncate">{bucket.shopifyProductUrl}</span>
                  <ExternalLink size={12} className="shrink-0" />
                </a>
              ) : (
                <span className="text-emerald-100/65">No link</span>
              )}
            </div>
            <div className="rounded-xl border border-amber-300/25 bg-amber-300/12 px-3 py-2 text-amber-100/95">
              <div className="mb-1 flex items-center gap-1.5 font-semibold uppercase tracking-wide text-[10px] text-amber-100/70">
                <Camera size={12} />
                Instagram
              </div>
              {bucket.instagramPostUrl ? (
                <a
                  href={bucket.instagramPostUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex max-w-full items-center gap-1.5 truncate text-amber-100 hover:text-white"
                >
                  <span className="truncate">{bucket.instagramPostUrl}</span>
                  <ExternalLink size={12} className="shrink-0" />
                </a>
              ) : (
                <span className="text-amber-100/65">No link</span>
              )}
            </div>
            <div className="rounded-xl border border-white/10 bg-white/6 px-3 py-2 text-amber-50/85">
              Price:{" "}
              <span className="font-semibold text-amber-50">
                {typeof bucket.price === "number" ? `$${bucket.price.toFixed(2)}` : "—"}
              </span>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/6 px-3 py-2 text-amber-50/85">
              Quantity:{" "}
              <span className="font-semibold text-amber-50">
                {typeof bucket.quantity === "number" ? bucket.quantity : "—"}
              </span>
            </div>
          </div>
        </div>
      </motion.section>
    );
  }

  return (
    <motion.section
      ref={containerRef}
      id={`bucket-${bucket.id}`}
      layout
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.24 }}
      className={`cinematic-card rounded-3xl p-5 ${
        isHighlighted
          ? "ring-2 ring-amber-300/75 shadow-[0_0_0_6px_rgba(245,158,11,0.14)]"
          : ""
      }`}
    >
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-amber-50">Bucket {bucketNumber}</h2>
          <p className="mt-1 text-xs text-amber-50/35">ID: {bucket.id}</p>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wider ${statusClasses} ${statusBadge}`}
        >
          {bucket.status}
        </span>
      </div>

      {isDoneBucket ? (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-amber-100/15 bg-white/6 px-3 py-2">
          <p className="text-xs text-amber-50/70">
            Editing a launched bucket uses in-place sync on the same Shopify product and never republishes Instagram silently.
          </p>
          <button
            type="button"
            onClick={() => onToggleDoneExpanded(bucket.id)}
            className="inline-flex items-center gap-1 rounded-xl border border-amber-100/20 bg-white/8 px-3 py-1.5 text-xs font-semibold text-amber-100 transition hover:bg-white/15"
          >
            <ChevronDown size={13} className="rotate-180" />
            Collapse
          </button>
        </div>
      ) : null}

      <div className="space-y-4">
        <label className="block space-y-2 text-sm">
          <span className="flex items-center gap-1.5 text-amber-50/65">
            <ImagePlus size={14} /> Product Images
          </span>
          <input
            type="file"
            multiple
            accept="image/*"
            disabled={controlsLocked}
            onChange={(event) => onImagesChange(bucket.id, event.target.files)}
            className="block w-full rounded-xl border border-amber-100/18 bg-black/25 px-3 py-2 text-sm text-amber-50/80 file:mr-3 file:rounded-lg file:border-0 file:bg-amber-300/25 file:px-3 file:py-2 file:text-amber-50 file:font-medium file:text-sm hover:file:bg-amber-300/35 transition"
          />
          {bucket.imageUrls.length > 0 ? (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {bucket.imageUrls.map((imageUrl) => (
                <div
                  key={`${bucket.id}-${imageUrl}`}
                  className="overflow-hidden rounded-xl border border-amber-100/15"
                >
                  <Image
                    src={imageUrl}
                    alt="Uploaded"
                    width={200}
                    height={120}
                    unoptimized
                    className="h-20 w-full object-cover"
                  />
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-amber-50/35">Upload at least one image.</p>
          )}
        </label>

        <div className="space-y-2 text-sm">
          <span className="text-amber-50/65">Title</span>
          <div className="flex gap-2">
            <input
              value={isDoneBucket ? doneDraft.titleRaw : bucket.titleRaw}
              onChange={(event) => {
                if (isDoneBucket) {
                  setDoneDraft((current) => ({ ...current, titleRaw: event.target.value }));
                  return;
                }
                onLocalFieldChange(bucket.id, "titleRaw", event.target.value);
              }}
              onBlur={() => {
                if (!isDoneBucket) {
                  onPersistField(bucket.id, "titleRaw");
                }
              }}
              placeholder="Enter title"
              disabled={controlsLocked}
              className={inputClass}
            />
            {!isDoneBucket ? (
              <button
                type="button"
                onClick={() => onEnhanceTitle(bucket.id)}
                disabled={controlsLocked || !bucket.titleRaw.trim()}
                className="inline-flex items-center gap-1.5 rounded-xl border border-violet-300/30 bg-violet-400/14 px-3 py-2 text-xs font-semibold text-violet-100 transition hover:bg-violet-400/24 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isEnhancingTitle ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <Sparkles size={12} />
                )}
                {isEnhancingTitle ? "Enhancing..." : "Enhance"}
              </button>
            ) : null}
          </div>
        </div>

        <div className="space-y-2 text-sm">
          <span className="text-amber-50/65">Description</span>
          <div className="flex gap-2">
            <textarea
              value={isDoneBucket ? doneDraft.descriptionRaw : bucket.descriptionRaw}
              onChange={(event) => {
                if (isDoneBucket) {
                  setDoneDraft((current) => ({
                    ...current,
                    descriptionRaw: event.target.value,
                  }));
                  return;
                }
                onLocalFieldChange(bucket.id, "descriptionRaw", event.target.value);
              }}
              onBlur={() => {
                if (!isDoneBucket) {
                  onPersistField(bucket.id, "descriptionRaw");
                }
              }}
              rows={4}
              placeholder="Enter description"
              disabled={controlsLocked}
              className={`${inputClass} resize-none`}
            />
            {!isDoneBucket ? (
              <button
                type="button"
                onClick={() => onEnhanceDescription(bucket.id)}
                disabled={controlsLocked || !bucket.descriptionRaw.trim()}
                className="h-fit inline-flex items-center gap-1.5 rounded-xl border border-violet-300/30 bg-violet-400/14 px-3 py-2 text-xs font-semibold text-violet-100 transition hover:bg-violet-400/24 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isEnhancingDescription ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <Sparkles size={12} />
                )}
                {isEnhancingDescription ? "Enhancing..." : "Enhance"}
              </button>
            ) : null}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-2 text-sm">
            <span className="text-amber-50/65">Quantity</span>
            <input
              type="number"
              min="1"
              value={isDoneBucket ? doneDraft.quantity ?? "" : bucket.quantity ?? ""}
              onChange={(event) => {
                const next =
                  event.target.value === "" ? null : Number.parseInt(event.target.value, 10);
                if (isDoneBucket) {
                  setDoneDraft((current) => ({ ...current, quantity: next }));
                  return;
                }
                onLocalFieldChange(bucket.id, "quantity", next);
              }}
              onBlur={() => {
                if (!isDoneBucket) {
                  onPersistField(bucket.id, "quantity");
                }
              }}
              disabled={controlsLocked}
              className={inputClass}
            />
          </label>
          <label className="space-y-2 text-sm">
            <span className="text-amber-50/65">Price ($)</span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={isDoneBucket ? doneDraft.price ?? "" : bucket.price ?? ""}
              onChange={(event) => {
                const next =
                  event.target.value === "" ? null : Number.parseFloat(event.target.value);
                if (isDoneBucket) {
                  setDoneDraft((current) => ({ ...current, price: next }));
                  return;
                }
                onLocalFieldChange(bucket.id, "price", next);
              }}
              onBlur={() => {
                if (!isDoneBucket) {
                  onPersistField(bucket.id, "price");
                }
              }}
              disabled={controlsLocked}
              className={inputClass}
            />
          </label>
        </div>

        {bucket.shopifyProductUrl ? (
          <a
            href={bucket.shopifyProductUrl}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 rounded-xl border border-emerald-300/30 bg-emerald-400/12 px-3 py-2 text-sm text-emerald-100 transition hover:bg-emerald-400/20"
          >
            <ShoppingBag size={14} />
            <span className="truncate">Shopify: {bucket.shopifyProductUrl}</span>
            <ExternalLink size={12} className="ml-auto shrink-0" />
          </a>
        ) : null}

        {bucket.instagramPostUrl ? (
          <a
            href={bucket.instagramPostUrl}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 rounded-xl border border-amber-300/30 bg-amber-300/12 px-3 py-2 text-sm text-amber-100 transition hover:bg-amber-300/20"
          >
            <Camera size={14} />
            <span className="truncate">Instagram: {bucket.instagramPostUrl}</span>
            <ExternalLink size={12} className="ml-auto shrink-0" />
          </a>
        ) : null}

        {bucket.errorMessage ? (
          <div className="flex items-start gap-2 rounded-xl border border-red-300/30 bg-red-500/16 px-3 py-2 text-sm text-red-100">
            <AlertCircle size={14} className="mt-0.5 shrink-0" />
            <span>{bucket.errorMessage}</span>
          </div>
        ) : null}

        {showTrashControl ? (
          <div className={`space-y-2 rounded-xl border p-3 ${trashContainerClass}`}>
            {!confirmingTrash ? (
              <button
                type="button"
                aria-label="Open trash options"
                data-testid={`bucket-trash-open-${bucket.id}`}
                onClick={() => setConfirmingTrash(true)}
                disabled={controlsLocked}
                className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${trashPrimaryClass}`}
              >
                <Trash2 size={14} />
                {trashLabel}
              </button>
            ) : (
              <div className="space-y-2">
                <p className={`text-xs font-medium ${trashDescriptionClass}`}>{trashDescription}</p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    data-testid={`bucket-trash-soft-${bucket.id}`}
                    onClick={() => {
                      setConfirmingTrash(false);
                      onMoveToTrash(bucket.id);
                    }}
                    disabled={controlsLocked}
                    className="inline-flex items-center gap-2 rounded-lg border border-amber-100/20 bg-white/12 px-3 py-2 text-sm font-semibold text-amber-50 transition hover:bg-white/18 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isTrashing ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <Trash2 size={14} />
                    )}
                    Move to Trash (30 days)
                  </button>
                  <button
                    type="button"
                    data-testid={`bucket-trash-hard-${bucket.id}`}
                    onClick={() => {
                      setConfirmingTrash(false);
                      onDeletePermanently(bucket.id);
                    }}
                    disabled={controlsLocked}
                    className="inline-flex items-center gap-2 rounded-lg border border-red-400/45 bg-red-500/20 px-3 py-2 text-sm font-semibold text-red-100 transition hover:bg-red-500/30 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isDeleting ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <Trash2 size={14} />
                    )}
                    Delete Permanently
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : null}

        <AnimatePresence initial={false}>
          {isDoneBucket && doneSyncMessage ? (
            <motion.div
              key={`sync-message-${bucket.id}-${doneSyncMessage}`}
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className={`rounded-xl border px-3 py-2 text-sm ${
                doneSyncMessage.toLowerCase().includes("failed")
                  ? "border-red-300/30 bg-red-500/16 text-red-100"
                  : doneSyncMessage.toLowerCase().includes("does not allow editing")
                    ? "border-amber-300/30 bg-amber-300/14 text-amber-100"
                    : "border-emerald-300/30 bg-emerald-400/14 text-emerald-100"
              }`}
            >
              {doneSyncMessage}
            </motion.div>
          ) : null}
        </AnimatePresence>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 text-xs text-amber-50/45">
            <span className="flex items-center gap-1">
              <ShoppingBag size={12} />{" "}
              {bucket.shopifyCreated ? "Created" : "Pending"}
            </span>
            <span className="flex items-center gap-1">
              <Camera size={12} />{" "}
              {bucket.instagramPublished
                ? "Published"
                : bucket.status === "FAILED"
                  ? "Failed"
                  : "Pending"}
            </span>
          </div>

          {isDoneBucket ? (
            <button
              type="button"
              data-testid={`bucket-sync-${bucket.id}`}
              onClick={() => onSyncDone(bucket.id, donePatch)}
              disabled={controlsLocked || isSyncingDone || !hasDoneChanges}
              className="btn-warm inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-55"
            >
              <span className="flex items-center gap-2">
                {isSyncingDone ? (
                  <>
                    <Loader2 size={14} className="animate-spin" /> Syncing...
                  </>
                ) : (
                  <>
                    <PencilLine size={14} /> Sync Updates
                  </>
                )}
              </span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onGo(bucket.id)}
              disabled={bucket.status !== "READY" || controlsLocked}
              className="btn-warm inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-55"
            >
              <span className="flex items-center gap-2">
                {isLaunching ? (
                  <>
                    <Loader2 size={14} className="animate-spin" /> Launching...
                  </>
                ) : (
                  <>
                    <Rocket size={14} /> GO
                  </>
                )}
              </span>
            </button>
          )}
        </div>

        {isSaving ? (
          <div className="flex items-center gap-1.5 text-xs text-amber-50/45">
            <Loader2 size={12} className="animate-spin" /> Saving changes...
          </div>
        ) : null}
      </div>
    </motion.section>
  );
}
