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

function statusStyle(status: Bucket["status"]): { classes: string; badge: string } {
  if (status === "DONE")
    return {
      classes:
        "border border-black/20 bg-white text-black shadow-[0_0_0_rgba(0,0,0,0)]",
      badge: "badge-gold",
    };
  if (status === "FAILED")
    return {
      classes:
        "border border-black/25 bg-white text-black shadow-[0_0_0_rgba(0,0,0,0)]",
      badge: "badge-red",
    };
  if (status === "PROCESSING")
    return {
      classes:
        "border border-black/20 bg-white text-black shadow-[0_0_0_rgba(0,0,0,0)]",
      badge: "pulse-blue",
    };
  if (status === "ENHANCING")
    return {
      classes:
        "border border-black/20 bg-white text-black shadow-[0_0_0_rgba(0,0,0,0)]",
      badge: "badge-purple",
    };
  if (status === "READY")
    return {
      classes:
        "border border-black/20 bg-white text-black shadow-[0_0_0_rgba(0,0,0,0)]",
      badge: "badge-green",
    };

  return {
    classes: "border border-slate-200 bg-white/80 text-slate-600",
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

function syncChipClassName(tone: SyncStatusChip["tone"]): string {
  if (tone === "success") {
    return "border-emerald-500/35 bg-emerald-50 text-emerald-900";
  }
  if (tone === "warning") {
    return "border-amber-500/35 bg-amber-50 text-amber-900";
  }
  return "border-rose-500/35 bg-rose-50 text-rose-900";
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
    ? "border-slate-200 bg-white/75"
    : "border-black/20 bg-white";
  const trashDescriptionClass = isEmptyTrash ? "text-slate-600" : "text-black";

  const { classes: statusClasses, badge: statusBadge } = statusStyle(bucket.status);
  const inputClass = "cinematic-input w-full rounded-2xl px-3 py-2.5 text-sm";

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
            ? "ring-2 ring-black/20 shadow-[0_0_0_6px_rgba(0,0,0,0.06)]"
            : ""
        }`}
      >
        <div className="flex flex-col gap-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] uppercase tracking-[0.22em] text-slate-500">
                Bucket {bucketNumber}
              </p>
              <h2 className="mt-1 text-lg font-semibold text-slate-900">{doneSummaryTitle}</h2>
              <p className="mt-1 text-xs text-slate-500">Updated {new Date(bucket.updatedAt).toLocaleString()}</p>
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
                  className="h-14 w-14 overflow-hidden rounded-xl border border-slate-200 bg-slate-100"
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
                <span className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">
                  No images
                </span>
              ) : null}
            </div>
            <LiquidButton
              data-testid={`bucket-edit-${bucket.id}`}
              onClick={() => onToggleDoneExpanded(bucket.id)}
              variant="secondary"
              size="sm"
              className="rounded-2xl"
            >
              <PencilLine size={14} />
              Edit
            </LiquidButton>
          </div>

          <div className="grid gap-2 text-xs sm:grid-cols-2">
            <div className="rounded-xl border border-black/18 bg-white px-3 py-2 text-black">
              <div className="mb-1 flex items-center gap-1.5 font-semibold uppercase tracking-wide text-[10px] text-black/55">
                <ShoppingBag size={12} />
                Shopify
              </div>
              {bucket.shopifyProductUrl ? (
                <a
                  href={bucket.shopifyProductUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex max-w-full items-center gap-1.5 truncate text-black hover:text-black"
                >
                  <span className="truncate">{bucket.shopifyProductUrl}</span>
                  <ExternalLink size={12} className="shrink-0" />
                </a>
              ) : (
                <span className="text-black/55">No link</span>
              )}
            </div>
            <div className="rounded-xl border border-black/18 bg-white px-3 py-2 text-black">
              <div className="mb-1 flex items-center gap-1.5 font-semibold uppercase tracking-wide text-[10px] text-black/55">
                <Camera size={12} />
                Instagram
              </div>
              {bucket.instagramPostUrl ? (
                <a
                  href={bucket.instagramPostUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex max-w-full items-center gap-1.5 truncate text-black hover:text-black"
                >
                  <span className="truncate">{bucket.instagramPostUrl}</span>
                  <ExternalLink size={12} className="shrink-0" />
                </a>
              ) : (
                <span className="text-black/55">No link</span>
              )}
            </div>
            <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-slate-700">
              Price:{" "}
              <span className="font-semibold text-slate-900">
                {typeof bucket.price === "number" ? `$${bucket.price.toFixed(2)}` : "—"}
              </span>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-slate-700">
              Quantity:{" "}
              <span className="font-semibold text-slate-900">
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
          ? "ring-2 ring-black/20 shadow-[0_0_0_6px_rgba(0,0,0,0.06)]"
          : ""
      }`}
    >
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Bucket {bucketNumber}</h2>
          <p className="mt-1 text-xs text-slate-500">ID: {bucket.id}</p>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wider ${statusClasses} ${statusBadge}`}
        >
          {bucket.status}
        </span>
      </div>

      {isDoneBucket ? (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-200 bg-white/80 px-3 py-2">
          <p className="text-xs text-slate-600">
            Editing a launched bucket uses in-place sync on the same Shopify product and never republishes Instagram silently.
          </p>
          <LiquidButton
            onClick={() => onToggleDoneExpanded(bucket.id)}
            variant="ghost"
            size="sm"
            className="rounded-2xl"
          >
            <ChevronDown size={13} className="rotate-180" />
            Collapse
          </LiquidButton>
        </div>
      ) : null}

      <div className="space-y-4">
        <label className="block space-y-2 text-sm">
          <span className="flex items-center gap-1.5 text-slate-600">
            <ImagePlus size={14} /> Product Images
          </span>
          <div className="relative">
            <input
              type="file"
              multiple
              accept="image/*"
              disabled={controlsLocked}
              onChange={(event) => onImagesChange(bucket.id, event.target.files)}
              className="block w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 file:mr-3 file:rounded-lg file:border-0 file:bg-black file:px-3 file:py-2 file:text-white file:font-medium file:text-sm hover:file:bg-black/85 transition"
            />
            {isUploading ? (
              <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2">
                <RippleCircles compact />
              </div>
            ) : null}
          </div>
          {bucket.imageUrls.length > 0 ? (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {bucket.imageUrls.map((imageUrl) => (
                <div
                  key={`${bucket.id}-${imageUrl}`}
                  className="overflow-hidden rounded-xl border border-slate-200"
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
            <p className="text-xs text-slate-500">Upload at least one image.</p>
          )}
        </label>

        <div className="space-y-2 text-sm">
          <span className="text-slate-600">Title</span>
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
              <LiquidButton
                onClick={() => onEnhanceTitle(bucket.id)}
                disabled={controlsLocked || !bucket.titleRaw.trim()}
                variant="ghost"
                size="sm"
                className="rounded-2xl"
              >
                {isEnhancingTitle ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <Sparkles size={12} />
                )}
                {isEnhancingTitle ? "Enhancing..." : "Enhance"}
              </LiquidButton>
            ) : null}
          </div>
        </div>

        <div className="space-y-2 text-sm">
          <span className="text-slate-600">Description</span>
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
              <LiquidButton
                onClick={() => onEnhanceDescription(bucket.id)}
                disabled={controlsLocked || !bucket.descriptionRaw.trim()}
                variant="ghost"
                size="sm"
                className="h-fit rounded-2xl"
              >
                {isEnhancingDescription ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <Sparkles size={12} />
                )}
                {isEnhancingDescription ? "Enhancing..." : "Enhance"}
              </LiquidButton>
            ) : null}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-2 text-sm">
            <span className="text-slate-600">Quantity</span>
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
            <span className="text-slate-600">Price ($)</span>
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
            className="flex items-center gap-2 rounded-xl border border-black/20 bg-white px-3 py-2 text-sm text-black transition hover:bg-black/[0.04]"
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
            className="flex items-center gap-2 rounded-xl border border-black/20 bg-white px-3 py-2 text-sm text-black transition hover:bg-black/[0.04]"
          >
            <Camera size={14} />
            <span className="truncate">Instagram: {bucket.instagramPostUrl}</span>
            <ExternalLink size={12} className="ml-auto shrink-0" />
          </a>
        ) : null}

        {bucket.errorMessage ? (
          <div className="flex items-start gap-2 rounded-xl border border-black/25 bg-white px-3 py-2 text-sm text-black">
            <AlertCircle size={14} className="mt-0.5 shrink-0" />
            <span>{bucket.errorMessage}</span>
          </div>
        ) : null}

        {showTrashControl ? (
          <div className={`space-y-2 rounded-xl border p-3 ${trashContainerClass}`}>
            {!confirmingTrash ? (
              <LiquidButton
                aria-label="Open trash options"
                data-testid={`bucket-trash-open-${bucket.id}`}
                onClick={() => setConfirmingTrash(true)}
                disabled={controlsLocked}
                variant={isEmptyTrash ? "secondary" : "ghost"}
                size="sm"
                className="rounded-2xl"
              >
                <Trash2 size={14} />
                {trashLabel}
              </LiquidButton>
            ) : (
              <div className="space-y-2">
                <p className={`text-xs font-medium ${trashDescriptionClass}`}>{trashDescription}</p>
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
                    className="rounded-2xl"
                  >
                    {isTrashing ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <Trash2 size={14} />
                    )}
                    Move to Trash (30 days)
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
                    className="rounded-2xl"
                  >
                    {isDeleting ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <Trash2 size={14} />
                    )}
                    Delete Permanently
                  </LiquidButton>
                </div>
              </div>
            )}
          </div>
        ) : null}

        <AnimatePresence initial={false}>
          {isDoneBucket && doneSyncChips.length > 0 ? (
            <motion.div
              key={`sync-status-${bucket.id}-${doneSyncChips.map((chip) => chip.id).join("-")}`}
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="flex flex-wrap items-center gap-2 rounded-2xl border border-black/15 bg-white/90 px-3 py-2"
            >
              {doneSyncChips.map((chip) => (
                <span
                  key={`${bucket.id}-${chip.id}`}
                  title={chip.detail || undefined}
                  className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold tracking-wide ${syncChipClassName(chip.tone)}`}
                >
                  {chip.label}
                </span>
              ))}
            </motion.div>
          ) : null}
        </AnimatePresence>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 text-xs text-slate-500">
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
            <LiquidButton
              data-testid={`bucket-sync-${bucket.id}`}
              onClick={() => onSyncDone(bucket.id, donePatch)}
              disabled={controlsLocked || isSyncingDone || !hasDoneChanges}
              size="md"
              className="rounded-2xl"
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
            </LiquidButton>
          ) : (
            <LiquidButton
              onClick={() => onGo(bucket.id)}
              disabled={bucket.status !== "READY" || controlsLocked}
              size="md"
              className="rounded-2xl"
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
            </LiquidButton>
          )}
        </div>

        {isSaving ? (
          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <Loader2 size={12} className="animate-spin" /> Saving changes...
          </div>
        ) : null}
      </div>
    </motion.section>
  );
}

