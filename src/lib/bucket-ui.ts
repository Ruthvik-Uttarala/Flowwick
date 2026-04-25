import type { BucketStatus } from "@/src/lib/types";

export function shouldShowBucketTrashControl(status: BucketStatus): boolean {
  return status === "EMPTY" || status === "FAILED";
}

export function shouldEnableBucketTrashAction(status: BucketStatus): boolean {
  return status === "EMPTY" || status === "FAILED";
}

export function getBucketTrashLabel(status: BucketStatus): string {
  return status === "EMPTY" ? "Remove Post" : "Remove Post";
}

export function getBucketTrashDescription(status: BucketStatus): string {
  return status === "EMPTY"
    ? "This empty post can be removed without affecting Shopify or Instagram."
    : "This post failed to publish. Choose how to remove it.";
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
