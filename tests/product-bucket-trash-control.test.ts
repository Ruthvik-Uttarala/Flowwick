import { describe, expect, it } from "vitest";
import {
  getBucketTrashDescription,
  getBucketTrashLabel,
  isDoneBucketCollapsedByDefault,
  shouldShowBucketTrashControl,
  toggleDoneBucketExpandedState,
} from "@/src/lib/bucket-ui";

describe("product bucket trash affordance", () => {
  it("shows trash controls for empty and failed buckets", () => {
    expect(shouldShowBucketTrashControl("EMPTY")).toBe(true);
    expect(shouldShowBucketTrashControl("FAILED")).toBe(true);
  });

  it("hides trash controls for processing and enhancing buckets", () => {
    expect(shouldShowBucketTrashControl("PROCESSING")).toBe(false);
    expect(shouldShowBucketTrashControl("ENHANCING")).toBe(false);
  });

  it("keeps ready and done non-trashable", () => {
    expect(shouldShowBucketTrashControl("READY")).toBe(false);
    expect(shouldShowBucketTrashControl("DONE")).toBe(false);
  });

  it("uses neutral empty-bucket trash copy", () => {
    expect(getBucketTrashLabel("EMPTY")).toBe("Remove Bucket");
    expect(getBucketTrashDescription("EMPTY")).toContain("empty bucket");
  });

  it("collapses done buckets by default and keeps others expanded", () => {
    expect(isDoneBucketCollapsedByDefault("DONE")).toBe(true);
    expect(isDoneBucketCollapsedByDefault("READY")).toBe(false);
  });

  it("toggles done-bucket expansion per bucket id", () => {
    const next = toggleDoneBucketExpandedState({}, "bucket-1");
    expect(next["bucket-1"]).toBe(true);
    const collapsed = toggleDoneBucketExpandedState(next, "bucket-1");
    expect(collapsed["bucket-1"]).toBe(false);
  });
});
