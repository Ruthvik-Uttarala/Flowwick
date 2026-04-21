import { describe, expect, it } from "vitest";
import {
  applyCreatedBucket,
  applyMoveToTrash,
  applyPermanentDelete,
  applyRestoreFromTrash,
  getBucketPollIntervalMs,
  getTrashDaysRemaining,
  hasActiveBucketWork,
} from "@/src/lib/dashboard-buckets";
import type { ProductBucket } from "@/src/lib/types";

function makeBucket(id: string, overrides: Partial<ProductBucket> = {}): ProductBucket {
  return {
    id,
    titleRaw: `Bucket ${id}`,
    descriptionRaw: "desc",
    titleEnhanced: "",
    descriptionEnhanced: "",
    quantity: 1,
    price: 9.99,
    imageUrls: ["https://cdn.example/a.jpg"],
    status: "FAILED",
    shopifyCreated: false,
    shopifyProductId: "",
    shopifyProductUrl: "",
    instagramPublished: false,
    instagramPostId: "",
    instagramPostUrl: "",
    errorMessage: "failed",
    trashedAt: "",
    deleteAfterAt: "",
    createdAt: "2026-04-20T10:00:00.000Z",
    updatedAt: "2026-04-20T10:00:00.000Z",
    ...overrides,
  };
}

describe("dashboard bucket collection transitions", () => {
  it("returns the new bucket id as a deterministic create scroll target", () => {
    const oldBucket = makeBucket("bucket-1", { createdAt: "2026-04-20T09:00:00.000Z" });
    const newBucket = makeBucket("bucket-2", { createdAt: "2026-04-20T10:00:00.000Z" });

    const result = applyCreatedBucket([oldBucket], newBucket);
    expect(result.scrollTargetBucketId).toBe("bucket-2");
    expect(result.buckets.map((bucket) => bucket.id)).toEqual(["bucket-1", "bucket-2"]);
  });

  it("moves trashed buckets out of active list and into trash list", () => {
    const active = makeBucket("bucket-1");
    const trashed = makeBucket("bucket-1", {
      trashedAt: "2026-04-20T10:00:00.000Z",
      deleteAfterAt: "2026-05-20T10:00:00.000Z",
    });

    const result = applyMoveToTrash({ buckets: [active], trashedBuckets: [] }, trashed);
    expect(result.buckets).toEqual([]);
    expect(result.trashedBuckets.map((bucket) => bucket.id)).toEqual(["bucket-1"]);
  });

  it("restores buckets back to active list and removes them from trash", () => {
    const restored = makeBucket("bucket-1", {
      status: "READY",
      trashedAt: "",
      deleteAfterAt: "",
      createdAt: "2026-04-20T09:30:00.000Z",
    });
    const trashed = makeBucket("bucket-1", {
      trashedAt: "2026-04-20T10:00:00.000Z",
      deleteAfterAt: "2026-05-20T10:00:00.000Z",
    });

    const result = applyRestoreFromTrash(
      { buckets: [], trashedBuckets: [trashed] },
      restored
    );

    expect(result.buckets.map((bucket) => bucket.id)).toEqual(["bucket-1"]);
    expect(result.trashedBuckets).toEqual([]);
  });

  it("removes permanently deleted buckets from all collections", () => {
    const first = makeBucket("bucket-1");
    const second = makeBucket("bucket-2");
    const trashed = makeBucket("bucket-2", {
      trashedAt: "2026-04-20T10:00:00.000Z",
      deleteAfterAt: "2026-05-20T10:00:00.000Z",
    });

    const result = applyPermanentDelete(
      { buckets: [first, second], trashedBuckets: [trashed] },
      "bucket-2"
    );

    expect(result.buckets.map((bucket) => bucket.id)).toEqual(["bucket-1"]);
    expect(result.trashedBuckets).toEqual([]);
  });

  it("computes days remaining until trash expiration", () => {
    const days = getTrashDaysRemaining(
      "2026-04-25T00:00:00.000Z",
      new Date("2026-04-20T00:00:00.000Z")
    );

    expect(days).toBe(5);
  });

  it("detects when any bucket is still actively processing", () => {
    const idle = [makeBucket("bucket-1", { status: "READY" }), makeBucket("bucket-2", { status: "DONE" })];
    const active = [makeBucket("bucket-3", { status: "PROCESSING" })];

    expect(hasActiveBucketWork(idle)).toBe(false);
    expect(hasActiveBucketWork(active)).toBe(true);
  });

  it("uses a faster poll interval while GO ALL is running", () => {
    expect(getBucketPollIntervalMs(true)).toBe(1500);
    expect(getBucketPollIntervalMs(false)).toBe(2500);
  });
});
