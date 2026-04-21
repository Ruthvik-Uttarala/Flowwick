import { describe, expect, it } from "vitest";
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

  it("selects only READY bucket ids for GO ALL fan-out", () => {
    const buckets = [
      makeBucket("bucket-1", { status: "READY" }),
      makeBucket("bucket-2", { status: "DONE" }),
      makeBucket("bucket-3", { status: "PROCESSING" }),
      makeBucket("bucket-4", { status: "READY" }),
    ];

    expect(pickGoAllReadyBucketIds(buckets)).toEqual(["bucket-1", "bucket-4"]);
  });

  it("immediately marks selected READY buckets as PROCESSING for GO ALL", () => {
    const buckets = [
      makeBucket("bucket-1", { status: "READY", errorMessage: "stale error" }),
      makeBucket("bucket-2", { status: "DONE" }),
      makeBucket("bucket-3", { status: "READY", errorMessage: "another stale error" }),
    ];

    const updated = markBucketsProcessingForGoAll(buckets, ["bucket-1", "bucket-3"]);
    expect(updated.find((bucket) => bucket.id === "bucket-1")?.status).toBe("PROCESSING");
    expect(updated.find((bucket) => bucket.id === "bucket-3")?.status).toBe("PROCESSING");
    expect(updated.find((bucket) => bucket.id === "bucket-2")?.status).toBe("DONE");
    expect(updated.find((bucket) => bucket.id === "bucket-1")?.errorMessage).toBe("");
    expect(updated.find((bucket) => bucket.id === "bucket-3")?.errorMessage).toBe("");
  });

  it("runs GO ALL workers with bounded concurrency and no duplicate launches", async () => {
    const bucketIds = ["bucket-1", "bucket-2", "bucket-3", "bucket-4"];
    const started = new Set<string>();
    const completed: string[] = [];

    await runBoundedQueue(bucketIds, 2, async (bucketId) => {
      expect(started.has(bucketId)).toBe(false);
      started.add(bucketId);
      await Promise.resolve();
      completed.push(bucketId);
    });

    expect(completed).toHaveLength(4);
    expect(new Set(completed)).toEqual(new Set(bucketIds));
  });
});
