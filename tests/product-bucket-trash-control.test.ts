import { describe, expect, it } from "vitest";
import { shouldShowBucketTrashControl } from "@/src/lib/bucket-ui";

describe("product bucket trash affordance", () => {
  it("shows trash controls for failed buckets", () => {
    expect(shouldShowBucketTrashControl("FAILED")).toBe(true);
  });

  it("hides trash controls for non-failed buckets", () => {
    expect(shouldShowBucketTrashControl("READY")).toBe(false);
    expect(shouldShowBucketTrashControl("DONE")).toBe(false);
    expect(shouldShowBucketTrashControl("EMPTY")).toBe(false);
  });
});
