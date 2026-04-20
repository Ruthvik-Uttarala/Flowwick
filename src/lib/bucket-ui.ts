import type { BucketStatus } from "@/src/lib/types";

export function shouldShowBucketTrashControl(status: BucketStatus): boolean {
  return status === "EMPTY" || status === "FAILED";
}

export function shouldEnableBucketTrashAction(status: BucketStatus): boolean {
  return status === "EMPTY" || status === "FAILED";
}

export function getBucketTrashLabel(status: BucketStatus): string {
  return status === "EMPTY" ? "Remove Bucket" : "Trash Bucket";
}

export function getBucketTrashDescription(status: BucketStatus): string {
  return status === "EMPTY"
    ? "Choose how to remove this empty bucket."
    : "Choose how to remove this failed bucket.";
}

export function isDoneBucketCollapsedByDefault(status: BucketStatus): boolean {
  return status === "DONE";
}

export function toggleDoneBucketExpandedState(
  current: Record<string, boolean>,
  bucketId: string
): Record<string, boolean> {
  return {
    ...current,
    [bucketId]: !current[bucketId],
  };
}
