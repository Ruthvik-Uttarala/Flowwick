"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertCircle,
  Camera,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  ImagePlus,
  Loader2,
  PencilLine,
  Send,
  ShoppingBag,
  Sparkles,
  Trash2,
} from "lucide-react";
import type {
  DoneBucketSyncPayload,
  EditableBucketField,
  ProductBucket as Bucket,
  SyncStatusChip,
} from "@/src/lib/types";
import {
  getBucketTrashDescription,
  getBucketTrashLabel,
  shouldShowBucketTrashControl,
} from "@/src/lib/bucket-ui";
import { LiquidButton } from "@/src/components/ui/liquid-glass-button";
import { RippleCircles } from "@/src/components/ui/ripple-circles";

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
  doneSyncChips: SyncStatusChip[];
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

// Friendly, non-technical status labels for the IG-style audience.
function statusMeta(status: Bucket["status"]): {
  label: string;
  classes: string;
  badge: string;
} {
  if (status === "DONE")
    return {
      label: "Posted",
      classes:
        "border border-[rgba(70,169,111,0.32)] bg-[rgba(70,169,111,0.1)] text-[#2f7c52]",
      badge: "badge-green",
    };
  if (status === "FAILED")
    return {
      label: "Needs attention",
      classes:
        "border border-[rgba(237,73,86,0.32)] bg-[rgba(237,73,86,0.08)] text-[#c83641]",
      badge: "badge-red",
    };
  if (status === "PROCESSING")
    return {
      label: "Posting...",
      classes:
        "border border-[rgba(0,149,246,0.32)] bg-[rgba(0,149,246,0.08)] text-[#0867b5]",
      badge: "pulse-blue",
    };
  if (status === "ENHANCING")
    return {
      label: "Polishing",
      classes:
        "border border-[rgba(131,58,180,0.32)] bg-[rgba(131,58,180,0.08)] text-[#5d2c81]",
      badge: "badge-purple",
    };
  if (status === "READY")
    return {
      label: "Ready",
      classes:
        "border border-[rgba(0,149,246,0.32)] bg-[rgba(0,149,246,0.06)] text-[#0867b5]",
      badge: "badge-blue",
    };

  return {
    label: "Draft",
    classes:
      "border border-[color:var(--fc-border-subtle)] bg-white text-[color:var(--fc-text-muted)]",
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

function postHeadline(bucket: Bucket, bucketNumber: number): string {
  return (
    bucket.titleEnhanced.trim() ||
    bucket.titleRaw.trim() ||
    `Post ${bucketNumber}`
  );
}

function syncChipClassName(tone: SyncStatusChip["tone"]): string {
  if (tone === "success") {
    return "border-[rgba(70,169,111,0.34)] bg-[rgba(70,169,111,0.1)] text-[#2f7c52]";
  }
  if (tone === "warning") {
    return "border-[rgba(252,175,69,0.4)] bg-[rgba(252,175,69,0.14)] text-[#8a5a10]";
  }
  return "border-[rgba(237,73,86,0.34)] bg-[rgba(237,73,86,0.08)] text-[#c83641]";
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
  doneSyncChips,
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
  const [carouselIndex, setCarouselIndex] = useState(0);

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

  useEffect(() => {
    // Clamp the carousel index if images change underneath us.
    if (carouselIndex >= bucket.imageUrls.length) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCarouselIndex(0);
    }
  }, [bucket.imageUrls.length, carouselIndex]);

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

  const status = statusMeta(bucket.status);
  const inputClass =
    "cinematic-input w-full rounded-lg px-3 py-2.5 text-sm text-[color:var(--fc-text-primary)]";

  const headline = postHeadline(bucket, bucketNumber);
  const hasImages = bucket.imageUrls.length > 0;
  const activeImage = hasImages ? bucket.imageUrls[Math.min(carouselIndex, bucket.imageUrls.length - 1)] : null;

  const goPrev = () =>
    setCarouselIndex((current) => (current === 0 ? bucket.imageUrls.length - 1 : current - 1));
  const goNext = () =>
    setCarouselIndex((current) => (current === bucket.imageUrls.length - 1 ? 0 : current + 1));

  // ---------- COLLAPSED (DONE) POST CARD ----------
  if (isDoneBucket && !isDoneExpanded) {
    return (
      <motion.section
        ref={containerRef}
        id={`bucket-${bucket.id}`}
        layout
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.22 }}
        className={`overflow-hidden rounded-2xl border border-[color:var(--fc-border-subtle)] bg-white ${
          isHighlighted ? "ring-2 ring-[color:var(--fc-focus-ring)]" : ""
        }`}
      >
        {/* Post header */}
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="ig-ring inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white">
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-[color:var(--fc-surface-muted)] text-[11px] font-bold text-[color:var(--fc-text-primary)]">
                {bucketNumber}
              </span>
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-[color:var(--fc-text-primary)]">
                {headline}
              </p>
              <p className="text-xs text-[color:var(--fc-text-muted)]">
                Posted · {new Date(bucket.updatedAt).toLocaleDateString()}
              </p>
            </div>
          </div>
          <span
            className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${status.classes}`}
          >
            {status.label}
          </span>
        </div>

        {/* Post image */}
        {activeImage ? (
          <div className="relative h-[260px] w-full bg-[color:var(--fc-surface-muted)] sm:h-[320px] lg:h-[380px]">
            <Image
              src={activeImage}
              alt={headline}
              fill
              unoptimized
              className="object-cover"
              sizes="(max-width: 640px) 100vw, 600px"
            />
          </div>
        ) : (
          <div className="flex aspect-square w-full items-center justify-center bg-[color:var(--fc-surface-muted)] text-[color:var(--fc-text-soft)]">
            <ImagePlus size={32} strokeWidth={1.5} />
          </div>
        )}

        {/* Post footer */}
        <div className="space-y-3 px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2 text-xs text-[color:var(--fc-text-muted)]">
              {typeof bucket.price === "number" ? (
                <span className="font-semibold text-[color:var(--fc-text-primary)]">
                  ${bucket.price.toFixed(2)}
                </span>
              ) : null}
              {typeof bucket.quantity === "number" ? (
                <span>· {bucket.quantity} in stock</span>
              ) : null}
            </div>
            <LiquidButton
              data-testid={`bucket-edit-${bucket.id}`}
              onClick={() => onToggleDoneExpanded(bucket.id)}
              variant="ghost"
              size="sm"
            >
              <PencilLine size={14} />
              Edit
            </LiquidButton>
          </div>

          <div className="grid gap-2 text-xs sm:grid-cols-2">
            <div className="rounded-lg border border-[color:var(--fc-border-subtle)] bg-[color:var(--fc-surface-muted)] px-3 py-2">
              <div className="mb-1 flex items-center gap-1.5 font-semibold text-[10px] uppercase tracking-wide text-[color:var(--fc-text-muted)]">
                <ShoppingBag size={12} />
                Shopify
              </div>
              {bucket.shopifyProductUrl ? (
                <a
                  href={bucket.shopifyProductUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex max-w-full items-center gap-1.5 truncate text-[color:var(--fc-text-primary)] hover:underline"
                >
                  <span className="truncate">View product</span>
                  <ExternalLink size={11} className="shrink-0" />
                </a>
              ) : (
                <span className="text-[color:var(--fc-text-soft)]">Not linked</span>
              )}
            </div>
            <div className="rounded-lg border border-[color:var(--fc-border-subtle)] bg-[color:var(--fc-surface-muted)] px-3 py-2">
              <div className="mb-1 flex items-center gap-1.5 font-semibold text-[10px] uppercase tracking-wide text-[color:var(--fc-text-muted)]">
                <Camera size={12} />
                Instagram
              </div>
              {bucket.instagramPostUrl ? (
                <a
                  href={bucket.instagramPostUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex max-w-full items-center gap-1.5 truncate text-[color:var(--fc-text-primary)] hover:underline"
                >
                  <span className="truncate">View post</span>
                  <ExternalLink size={11} className="shrink-0" />
                </a>
              ) : (
                <span className="text-[color:var(--fc-text-soft)]">Not linked</span>
              )}
            </div>
          </div>
        </div>
      </motion.section>
    );
  }

  // ---------- EXPANDED / DRAFT POST CARD ----------
  return (
    <motion.section
      ref={containerRef}
      id={`bucket-${bucket.id}`}
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22 }}
      className={`overflow-hidden rounded-2xl border border-[color:var(--fc-border-subtle)] bg-white ${
        isHighlighted ? "ring-2 ring-[color:var(--fc-focus-ring)]" : ""
      }`}
    >
      {/* Post header */}
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="ig-ring inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-[color:var(--fc-surface-muted)] text-[11px] font-bold text-[color:var(--fc-text-primary)]">
              {bucketNumber}
            </span>
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-[color:var(--fc-text-primary)]">
              Post {bucketNumber}
            </p>
            <p className="text-xs text-[color:var(--fc-text-muted)]">
              {isDoneBucket ? "Editing your post" : "Draft"}
            </p>
          </div>
        </div>
        <span
          className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${status.classes}`}
        >
          {status.label}
        </span>
      </div>

      {/* Post image area */}
      <div className="relative h-[280px] w-full bg-[color:var(--fc-surface-muted)] sm:h-[360px] lg:h-[420px]">
        {activeImage ? (
          <Image
            src={activeImage}
            alt={headline || `Post ${bucketNumber}`}
            fill
            unoptimized
            className="object-cover"
            sizes="(max-width: 640px) 100vw, 600px"
          />
        ) : (
          <label
            htmlFor={`upload-${bucket.id}`}
            className={`flex h-full w-full cursor-pointer flex-col items-center justify-center gap-2 px-6 text-center text-[color:var(--fc-text-muted)] ${
              controlsLocked ? "pointer-events-none opacity-60" : ""
            }`}
          >
            <ImagePlus size={36} strokeWidth={1.5} />
            <span className="text-sm font-medium text-[color:var(--fc-text-primary)]">
              Tap to add photos
            </span>
            <span className="text-xs">Pick one or more product photos</span>
          </label>
        )}

        {/* Carousel arrows */}
        {bucket.imageUrls.length > 1 ? (
          <>
            <button
              type="button"
              onClick={goPrev}
              aria-label="Previous photo"
              className="absolute left-2 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-[color:var(--fc-text-primary)] shadow-sm transition hover:bg-white"
            >
              <ChevronLeft size={18} />
            </button>
            <button
              type="button"
              onClick={goNext}
              aria-label="Next photo"
              className="absolute right-2 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-[color:var(--fc-text-primary)] shadow-sm transition hover:bg-white"
            >
              <ChevronRight size={18} />
            </button>
            <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1.5">
              {bucket.imageUrls.map((_, dotIndex) => (
                <span
                  key={`${bucket.id}-dot-${dotIndex}`}
                  className={`h-1.5 w-1.5 rounded-full transition ${
                    dotIndex === carouselIndex ? "bg-white" : "bg-white/55"
                  }`}
                />
              ))}
            </div>
          </>
        ) : null}

        {/* Upload affordance pinned over photo when there ARE photos */}
        {hasImages ? (
          <label
            htmlFor={`upload-${bucket.id}`}
            className={`absolute right-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-white/95 px-3 py-1.5 text-xs font-semibold text-[color:var(--fc-text-primary)] shadow-sm ${
              controlsLocked ? "pointer-events-none opacity-60" : "cursor-pointer hover:bg-white"
            }`}
          >
            <ImagePlus size={13} />
            Add photos
          </label>
        ) : null}

        {isUploading ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-white/55">
            <RippleCircles compact />
          </div>
        ) : null}

        <input
          id={`upload-${bucket.id}`}
          type="file"
          multiple
          accept="image/*"
          disabled={controlsLocked}
          onChange={(event) => onImagesChange(bucket.id, event.target.files)}
          className="sr-only"
        />
      </div>

      {/* Body / form */}
      <div className="space-y-4 px-4 pb-4 pt-3">
        {/* Caption (title) */}
        <div className="space-y-2 text-sm">
          <label className="text-xs font-semibold uppercase tracking-wide text-[color:var(--fc-text-muted)]">
            Title
          </label>
          <div className="flex items-start gap-2">
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
              placeholder="Give your post a name"
              disabled={controlsLocked}
              className={inputClass}
            />
            {!isDoneBucket ? (
              <LiquidButton
                onClick={() => onEnhanceTitle(bucket.id)}
                disabled={controlsLocked || !bucket.titleRaw.trim()}
                variant="ghost"
                size="sm"
                aria-label="Enhance title with AI"
              >
                {isEnhancingTitle ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Sparkles size={14} />
                )}
                <span className="hidden sm:inline">
                  {isEnhancingTitle ? "Enhancing" : "Enhance"}
                </span>
              </LiquidButton>
            ) : null}
          </div>
        </div>

        {/* Description */}
        <div className="space-y-2 text-sm">
          <label className="text-xs font-semibold uppercase tracking-wide text-[color:var(--fc-text-muted)]">
            Caption
          </label>
          <div className="flex items-start gap-2">
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
              placeholder="Write a caption..."
              disabled={controlsLocked}
              className={`${inputClass} resize-none`}
            />
            {!isDoneBucket ? (
              <LiquidButton
                onClick={() => onEnhanceDescription(bucket.id)}
                disabled={controlsLocked || !bucket.descriptionRaw.trim()}
                variant="ghost"
                size="sm"
                className="h-fit"
                aria-label="Enhance caption with AI"
              >
                {isEnhancingDescription ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Sparkles size={14} />
                )}
                <span className="hidden sm:inline">
                  {isEnhancingDescription ? "Enhancing" : "Enhance"}
                </span>
              </LiquidButton>
            ) : null}
          </div>
        </div>

        {/* Price + Quantity */}
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-2 text-sm">
            <span className="text-xs font-semibold uppercase tracking-wide text-[color:var(--fc-text-muted)]">
              Price
            </span>
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
              placeholder="0.00"
              className={inputClass}
            />
          </label>
          <label className="space-y-2 text-sm">
            <span className="text-xs font-semibold uppercase tracking-wide text-[color:var(--fc-text-muted)]">
              Quantity
            </span>
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
              placeholder="1"
              className={inputClass}
            />
          </label>
        </div>

        {bucket.shopifyProductUrl ? (
          <a
            href={bucket.shopifyProductUrl}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 rounded-lg border border-[color:var(--fc-border-subtle)] bg-[color:var(--fc-surface-muted)] px-3 py-2 text-sm text-[color:var(--fc-text-primary)] transition hover:bg-white"
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
            className="flex items-center gap-2 rounded-lg border border-[color:var(--fc-border-subtle)] bg-[color:var(--fc-surface-muted)] px-3 py-2 text-sm text-[color:var(--fc-text-primary)] transition hover:bg-white"
          >
            <Camera size={14} />
            <span className="truncate">Instagram: {bucket.instagramPostUrl}</span>
            <ExternalLink size={12} className="ml-auto shrink-0" />
          </a>
        ) : null}

        {bucket.errorMessage ? (
          <div className="flex items-start gap-2 rounded-lg border border-[rgba(237,73,86,0.32)] bg-[rgba(237,73,86,0.06)] px-3 py-2 text-sm text-[#c83641]">
            <AlertCircle size={14} className="mt-0.5 shrink-0" />
            <span>{bucket.errorMessage}</span>
          </div>
        ) : null}

        {/* Sync chips for DONE posts */}
        <AnimatePresence initial={false}>
          {isDoneBucket && doneSyncChips.length > 0 ? (
            <motion.div
              key={`sync-status-${bucket.id}-${doneSyncChips.map((chip) => chip.id).join("-")}`}
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              className="flex flex-wrap items-center gap-2 rounded-lg border border-[color:var(--fc-border-subtle)] bg-[color:var(--fc-surface-muted)] px-3 py-2"
            >
              {doneSyncChips.map((chip) => (
                <span
                  key={`${bucket.id}-${chip.id}`}
                  title={chip.detail || undefined}
                  className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold ${syncChipClassName(chip.tone)}`}
                >
                  {chip.label}
                </span>
              ))}
            </motion.div>
          ) : null}
        </AnimatePresence>

        {/* Action row */}
        <div className="flex flex-col gap-3 border-t border-[color:var(--fc-border-subtle)] pt-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3 text-xs text-[color:var(--fc-text-muted)]">
            <span className="inline-flex items-center gap-1">
              <ShoppingBag size={12} />
              {bucket.shopifyCreated ? "On Shopify" : "Not on Shopify"}
            </span>
            <span className="inline-flex items-center gap-1">
              <Camera size={12} />
              {bucket.instagramPublished
                ? "On Instagram"
                : bucket.status === "FAILED"
                  ? "Failed"
                  : "Not posted"}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {isDoneBucket ? (
              <>
                <LiquidButton
                  onClick={() => onToggleDoneExpanded(bucket.id)}
                  variant="ghost"
                  size="sm"
                >
                  Collapse
                </LiquidButton>
                <LiquidButton
                  data-testid={`bucket-sync-${bucket.id}`}
                  onClick={() => onSyncDone(bucket.id, donePatch)}
                  disabled={controlsLocked || isSyncingDone || !hasDoneChanges}
                  size="md"
                >
                  <span className="flex items-center gap-2">
                    {isSyncingDone ? (
                      <>
                        <Loader2 size={14} className="animate-spin" /> Syncing
                      </>
                    ) : (
                      <>
                        <PencilLine size={14} /> Update Post
                      </>
                    )}
                  </span>
                </LiquidButton>
              </>
            ) : (
              <LiquidButton
                onClick={() => onGo(bucket.id)}
                disabled={bucket.status !== "READY" || controlsLocked}
                size="md"
              >
                <span className="flex items-center gap-2">
                  {isLaunching ? (
                    <>
                      <Loader2 size={14} className="animate-spin" /> Posting
                    </>
                  ) : (
                    <>
                      <Send size={14} /> Post
                    </>
                  )}
                </span>
              </LiquidButton>
            )}
          </div>
        </div>

        {/* Trash control */}
        {showTrashControl ? (
          <div className="rounded-lg border border-[color:var(--fc-border-subtle)] bg-[color:var(--fc-surface-muted)] p-3">
            {!confirmingTrash ? (
              <LiquidButton
                aria-label="Open remove options"
                data-testid={`bucket-trash-open-${bucket.id}`}
                onClick={() => setConfirmingTrash(true)}
                disabled={controlsLocked}
                variant="ghost"
                size="sm"
              >
                <Trash2 size={14} />
                {trashLabel}
              </LiquidButton>
            ) : (
              <div className="space-y-2">
                <p className="text-xs text-[color:var(--fc-text-muted)]">{trashDescription}</p>
                <div className="flex flex-wrap gap-2">
                  <LiquidButton
                    data-testid={`bucket-trash-soft-${bucket.id}`}
                    onClick={() => {
                      setConfirmingTrash(false);
                      onMoveToTrash(bucket.id);
                    }}
                    disabled={controlsLocked}
                    variant="secondary"
                    size="sm"
                  >
                    {isTrashing ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <Trash2 size={14} />
                    )}
                    Move to Trash
                  </LiquidButton>
                  <LiquidButton
                    data-testid={`bucket-trash-hard-${bucket.id}`}
                    onClick={() => {
                      setConfirmingTrash(false);
                      onDeletePermanently(bucket.id);
                    }}
                    disabled={controlsLocked}
                    variant="danger"
                    size="sm"
                  >
                    {isDeleting ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <Trash2 size={14} />
                    )}
                    Delete forever
                  </LiquidButton>
                </div>
              </div>
            )}
          </div>
        ) : null}

        {isSaving ? (
          <div className="flex items-center gap-1.5 text-xs text-[color:var(--fc-text-muted)]">
            <Loader2 size={12} className="animate-spin" /> Saving...
          </div>
        ) : null}
      </div>
    </motion.section>
  );
}
