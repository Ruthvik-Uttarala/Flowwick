"use client";

import Image from "next/image";
import { useState } from "react";
import { motion } from "framer-motion";
import {
  ImagePlus,
  Sparkles,
  Rocket,
  Loader2,
  ExternalLink,
  ShoppingBag,
  Camera,
  AlertCircle,
  Trash2,
} from "lucide-react";
import type { EditableBucketField, ProductBucket as Bucket } from "@/src/lib/types";
import { shouldShowBucketTrashControl } from "@/src/lib/bucket-ui";

interface ProductBucketProps {
  bucket: Bucket;
  bucketNumber: number;
  isSaving: boolean;
  isUploading: boolean;
  isEnhancingTitle: boolean;
  isEnhancingDescription: boolean;
  isLaunching: boolean;
  isGlobalBusy: boolean;
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
  isTrashing: boolean;
  isDeleting: boolean;
  isHighlighted: boolean;
  containerRef?: (element: HTMLElement | null) => void;
}

function statusStyle(status: Bucket["status"]): { classes: string; badge: string } {
  if (status === "DONE")
    return { classes: "border-[#C47A2C]/20 bg-[#C47A2C]/10 text-[#C47A2C]", badge: "badge-gold" };
  if (status === "FAILED")
    return { classes: "border-red-400/20 bg-red-400/10 text-red-600", badge: "badge-red" };
  if (status === "PROCESSING")
    return { classes: "border-blue-400/20 bg-blue-400/10 text-blue-600", badge: "pulse-blue" };
  if (status === "ENHANCING")
    return { classes: "border-purple-400/20 bg-purple-400/10 text-purple-600", badge: "badge-purple" };
  if (status === "READY")
    return { classes: "border-green-600/20 bg-green-600/10 text-green-700", badge: "badge-green" };
  return { classes: "border-[#2B1B12]/[0.06] bg-white/40 text-[#2B1B12]/40", badge: "" };
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
  onLocalFieldChange,
  onPersistField,
  onImagesChange,
  onEnhanceTitle,
  onEnhanceDescription,
  onGo,
  onMoveToTrash,
  onDeletePermanently,
  isTrashing,
  isDeleting,
  isHighlighted,
  containerRef,
}: ProductBucketProps) {
  const [confirmingTrash, setConfirmingTrash] = useState(false);

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
  const { classes: statusClasses, badge: statusBadge } = statusStyle(bucket.status);

  const inputClass = "warm-input w-full rounded-xl px-3 py-2.5 text-sm";

  return (
    <motion.section
      ref={containerRef}
      id={`bucket-${bucket.id}`}
      layout
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.24 }}
      className={`warm-card warm-card-hover rounded-3xl p-5 transition-shadow ${
        isHighlighted ? "ring-2 ring-[#C47A2C]/55 shadow-[0_0_0_6px_rgba(196,122,44,0.10)]" : ""
      }`}
    >
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-[#2B1B12]">Bucket {bucketNumber}</h2>
          <p className="mt-1 text-xs text-[#2B1B12]/30">ID: {bucket.id}</p>
        </div>
        <span
          className={`rounded-full border px-3 py-1 text-xs font-semibold ${statusClasses} ${statusBadge}`}
        >
          {bucket.status}
        </span>
      </div>

      <div className="space-y-4">
        {/* Image Upload */}
        <label className="block space-y-2 text-sm">
          <span className="flex items-center gap-1.5 text-[#2B1B12]/50">
            <ImagePlus size={14} /> Product Images
          </span>
          <input
            type="file"
            multiple
            accept="image/*"
            disabled={controlsLocked}
            onChange={(event) => onImagesChange(bucket.id, event.target.files)}
            className="block w-full rounded-xl border border-[#2B1B12]/[0.08] bg-white/60 px-3 py-2 text-sm text-[#2B1B12]/60 file:mr-3 file:rounded-lg file:border-0 file:bg-[#C47A2C]/10 file:px-3 file:py-2 file:text-[#C47A2C] file:font-medium file:text-sm hover:file:bg-[#C47A2C]/20 transition"
          />
          {bucket.imageUrls.length > 0 ? (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {bucket.imageUrls.map((imageUrl) => (
                <div
                  key={`${bucket.id}-${imageUrl}`}
                  className="overflow-hidden rounded-xl border border-[#2B1B12]/[0.06]"
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
            <p className="text-xs text-[#2B1B12]/30">Upload at least one image.</p>
          )}
        </label>

        {/* Title */}
        <div className="space-y-2 text-sm">
          <span className="text-[#2B1B12]/50">Title</span>
          <div className="flex gap-2">
            <input
              value={bucket.titleRaw}
              onChange={(event) =>
                onLocalFieldChange(bucket.id, "titleRaw", event.target.value)
              }
              onBlur={() => onPersistField(bucket.id, "titleRaw")}
              placeholder="Enter title"
              disabled={controlsLocked}
              className={inputClass}
            />
            <button
              type="button"
              onClick={() => onEnhanceTitle(bucket.id)}
              disabled={controlsLocked || !bucket.titleRaw.trim()}
              className="inline-flex items-center gap-1.5 rounded-xl border border-purple-400/20 bg-purple-400/10 px-3 py-2 text-xs font-semibold text-purple-600 transition hover:bg-purple-400/20 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isEnhancingTitle ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <Sparkles size={12} />
              )}
              {isEnhancingTitle ? "Enhancing..." : "Enhance"}
            </button>
          </div>
        </div>

        {/* Description */}
        <div className="space-y-2 text-sm">
          <span className="text-[#2B1B12]/50">Description</span>
          <div className="flex gap-2">
            <textarea
              value={bucket.descriptionRaw}
              onChange={(event) =>
                onLocalFieldChange(bucket.id, "descriptionRaw", event.target.value)
              }
              onBlur={() => onPersistField(bucket.id, "descriptionRaw")}
              rows={4}
              placeholder="Enter description"
              disabled={controlsLocked}
              className={`${inputClass} resize-none`}
            />
            <button
              type="button"
              onClick={() => onEnhanceDescription(bucket.id)}
              disabled={controlsLocked || !bucket.descriptionRaw.trim()}
              className="h-fit inline-flex items-center gap-1.5 rounded-xl border border-purple-400/20 bg-purple-400/10 px-3 py-2 text-xs font-semibold text-purple-600 transition hover:bg-purple-400/20 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isEnhancingDescription ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <Sparkles size={12} />
              )}
              {isEnhancingDescription ? "Enhancing..." : "Enhance"}
            </button>
          </div>
        </div>

        {/* Quantity & Price */}
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-2 text-sm">
            <span className="text-[#2B1B12]/50">Quantity</span>
            <input
              type="number"
              min="1"
              value={bucket.quantity ?? ""}
              onChange={(event) =>
                onLocalFieldChange(
                  bucket.id,
                  "quantity",
                  event.target.value === "" ? null : Number.parseInt(event.target.value, 10)
                )
              }
              onBlur={() => onPersistField(bucket.id, "quantity")}
              disabled={controlsLocked}
              className={inputClass}
            />
          </label>
          <label className="space-y-2 text-sm">
            <span className="text-[#2B1B12]/50">Price ($)</span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={bucket.price ?? ""}
              onChange={(event) =>
                onLocalFieldChange(
                  bucket.id,
                  "price",
                  event.target.value === "" ? null : Number.parseFloat(event.target.value)
                )
              }
              onBlur={() => onPersistField(bucket.id, "price")}
              disabled={controlsLocked}
              className={inputClass}
            />
          </label>
        </div>

        {/* Result Links */}
        {bucket.shopifyProductUrl ? (
          <a
            href={bucket.shopifyProductUrl}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 rounded-xl border border-green-600/20 bg-green-600/10 px-3 py-2 text-sm text-green-700 transition hover:bg-green-600/15"
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
            className="flex items-center gap-2 rounded-xl border border-[#C47A2C]/20 bg-[#C47A2C]/10 px-3 py-2 text-sm text-[#C47A2C] transition hover:bg-[#C47A2C]/15"
          >
            <Camera size={14} />
            <span className="truncate">Instagram: {bucket.instagramPostUrl}</span>
            <ExternalLink size={12} className="ml-auto shrink-0" />
          </a>
        ) : null}

        {bucket.errorMessage ? (
          <div className="flex items-start gap-2 rounded-xl border border-red-400/20 bg-red-400/10 px-3 py-2 text-sm text-red-600">
            <AlertCircle size={14} className="mt-0.5 shrink-0" />
            <span>{bucket.errorMessage}</span>
          </div>
        ) : null}

        {showTrashControl ? (
          <div className="space-y-2 rounded-xl border border-red-400/20 bg-red-400/10 p-3">
            {!confirmingTrash ? (
              <button
                type="button"
                aria-label="Open trash options"
                onClick={() => setConfirmingTrash(true)}
                disabled={controlsLocked}
                className="inline-flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Trash2 size={14} />
                Trash Bucket
              </button>
            ) : (
              <div className="space-y-2">
                <p className="text-xs font-medium text-red-700">
                  Choose how to remove this failed bucket.
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setConfirmingTrash(false);
                      onMoveToTrash(bucket.id);
                    }}
                    disabled={controlsLocked}
                    className="inline-flex items-center gap-2 rounded-lg border border-[#2B1B12]/15 bg-white/85 px-3 py-2 text-sm font-semibold text-[#2B1B12] transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isTrashing ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                    Move to Trash (30 days)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setConfirmingTrash(false);
                      onDeletePermanently(bucket.id);
                    }}
                    disabled={controlsLocked}
                    className="inline-flex items-center gap-2 rounded-lg border border-red-500/40 bg-red-500/15 px-3 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-500/25 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isDeleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                    Delete Permanently
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : null}

        {/* Footer */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 text-xs text-[#2B1B12]/30">
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
        </div>

        {isSaving ? (
          <div className="flex items-center gap-1.5 text-xs text-[#2B1B12]/30">
            <Loader2 size={12} className="animate-spin" /> Saving changes...
          </div>
        ) : null}
      </div>
    </motion.section>
  );
}
