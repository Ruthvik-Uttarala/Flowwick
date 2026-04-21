import { ProductBucket } from "@/src/lib/types";

export interface BucketCollections {
  buckets: ProductBucket[];
  trashedBuckets: ProductBucket[];
}

const ACTIVE_BUCKET_STATUSES = new Set<ProductBucket["status"]>([
  "PROCESSING",
  "ENHANCING",
]);

function sortActiveBuckets(buckets: ProductBucket[]): ProductBucket[] {
  return [...buckets].sort((left, right) => left.createdAt.localeCompare(right.createdAt));
}

function sortTrashedBuckets(buckets: ProductBucket[]): ProductBucket[] {
  return [...buckets].sort((left, right) => right.trashedAt.localeCompare(left.trashedAt));
}

export function upsertBucketById(
  buckets: ProductBucket[],
  nextBucket: ProductBucket
): ProductBucket[] {
  const existingIndex = buckets.findIndex((bucket) => bucket.id === nextBucket.id);
  if (existingIndex < 0) {
    return [...buckets, nextBucket];
  }

  return buckets.map((bucket) => (bucket.id === nextBucket.id ? nextBucket : bucket));
}

export function applyCreatedBucket(
  buckets: ProductBucket[],
  createdBucket: ProductBucket
): {
  buckets: ProductBucket[];
  scrollTargetBucketId: string;
} {
  const nextBuckets = sortActiveBuckets(upsertBucketById(buckets, createdBucket));
  const scrollTargetBucketId = nextBuckets.some((bucket) => bucket.id === createdBucket.id)
    ? createdBucket.id
    : "";

  return { buckets: nextBuckets, scrollTargetBucketId };
}

export function applyMoveToTrash(
  collections: BucketCollections,
  trashedBucket: ProductBucket
): BucketCollections {
  const nextBuckets = collections.buckets.filter((bucket) => bucket.id !== trashedBucket.id);
  const nextTrashedBuckets = sortTrashedBuckets(
    upsertBucketById(collections.trashedBuckets, trashedBucket)
  );

  return {
    buckets: nextBuckets,
    trashedBuckets: nextTrashedBuckets,
  };
}

export function applyRestoreFromTrash(
  collections: BucketCollections,
  restoredBucket: ProductBucket
): BucketCollections {
  const nextBuckets = sortActiveBuckets(upsertBucketById(collections.buckets, restoredBucket));
  const nextTrashedBuckets = collections.trashedBuckets.filter(
    (bucket) => bucket.id !== restoredBucket.id
  );

  return {
    buckets: nextBuckets,
    trashedBuckets: nextTrashedBuckets,
  };
}

export function applyPermanentDelete(
  collections: BucketCollections,
  deletedBucketId: string
): BucketCollections {
  return {
    buckets: collections.buckets.filter((bucket) => bucket.id !== deletedBucketId),
    trashedBuckets: collections.trashedBuckets.filter(
      (bucket) => bucket.id !== deletedBucketId
    ),
  };
}

export function getTrashDaysRemaining(deleteAfterAt: string, now = new Date()): number {
  const target = Date.parse(deleteAfterAt);
  if (!Number.isFinite(target)) {
    return 0;
  }

  const remainingMs = target - now.getTime();
  if (remainingMs <= 0) {
    return 0;
  }

  return Math.ceil(remainingMs / (24 * 60 * 60 * 1000));
}

export function hasActiveBucketWork(buckets: ProductBucket[]): boolean {
  return buckets.some((bucket) => ACTIVE_BUCKET_STATUSES.has(bucket.status));
}

export function getBucketPollIntervalMs(isRunningGoAll: boolean): number {
  return isRunningGoAll ? 1500 : 2500;
}
