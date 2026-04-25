"use client";

import Image from "next/image";
import { ImagePlus, Layers } from "lucide-react";
import type { ProductBucket as Bucket } from "@/src/lib/types";

interface PostTileProps {
  bucket: Bucket;
  bucketNumber: number;
  isHighlighted: boolean;
  onOpen: (bucketId: string) => void;
}

function statusLabel(status: Bucket["status"]): string {
  switch (status) {
    case "DONE":
      return "Posted";
    case "READY":
      return "Ready";
    case "PROCESSING":
      return "Posting";
    case "ENHANCING":
      return "Polishing";
    case "FAILED":
      return "Issue";
    default:
      return "Draft";
  }
}

function statusBadgeClass(status: Bucket["status"]): string {
  if (status === "DONE")
    return "bg-white text-[color:var(--fc-text-primary)] shadow-sm";
  if (status === "FAILED") return "bg-white text-[#b91c1c] shadow-sm";
  if (status === "READY")
    return "bg-white text-[color:var(--fc-text-primary)] shadow-sm";
  return "bg-black/72 text-white";
}

export function PostTile({
  bucket,
  bucketNumber,
  isHighlighted,
  onOpen,
}: PostTileProps) {
  const cover = bucket.imageUrls[0] ?? null;
  const headline =
    bucket.titleEnhanced.trim() ||
    bucket.titleRaw.trim() ||
    `Post ${bucketNumber}`;
  const hasMultiple = bucket.imageUrls.length > 1;

  return (
    <button
      type="button"
      onClick={() => onOpen(bucket.id)}
      data-bucket-id={bucket.id}
      aria-label={`Open ${headline}`}
      className={`group relative block aspect-square w-full overflow-hidden rounded-md border border-[color:var(--fc-border-subtle)] bg-[color:var(--fc-surface-muted)] text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--fc-focus-ring)] focus-visible:ring-offset-2 hover:border-[color:var(--fc-border-strong)] ${
        isHighlighted ? "ring-2 ring-[color:var(--fc-text-primary)]" : ""
      }`}
    >
      {cover ? (
        <Image
          src={cover}
          alt={headline}
          fill
          unoptimized
          className="object-cover transition-transform duration-200 group-hover:scale-[1.015]"
          sizes="(max-width: 640px) 33vw, (max-width: 1024px) 33vw, 280px"
        />
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-center gap-1.5 text-[color:var(--fc-text-soft)]">
          <ImagePlus size={26} strokeWidth={1.4} />
          <span className="text-[11px] font-semibold text-[color:var(--fc-text-muted)]">
            Add photos
          </span>
        </div>
      )}

      {/* Subtle hover overlay for caption preview */}
      <div className="tile-overlay pointer-events-none absolute inset-x-0 bottom-0 flex items-end p-2 opacity-0 transition group-hover:opacity-100">
        <p className="line-clamp-1 text-[11px] font-semibold text-white">
          {headline}
        </p>
      </div>

      {/* Status badge top-right */}
      <span
        className={`absolute right-1.5 top-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusBadgeClass(bucket.status)}`}
      >
        {statusLabel(bucket.status)}
      </span>

      {/* Multi-photo hint */}
      {hasMultiple ? (
        <span
          aria-hidden="true"
          className="absolute left-1.5 top-1.5 inline-flex items-center justify-center rounded-full bg-black/55 p-1 text-white"
        >
          <Layers size={11} strokeWidth={2} />
        </span>
      ) : null}
    </button>
  );
}
