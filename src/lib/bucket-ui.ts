import type { BucketStatus } from "@/src/lib/types";

export function shouldShowBucketTrashControl(status: BucketStatus): boolean {
  return status === "FAILED";
}
