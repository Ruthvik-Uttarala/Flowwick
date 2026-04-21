import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function readSource(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), "utf8");
}

describe("ui regressions", () => {
  it("keeps homepage brand assets wired into the real app surfaces", () => {
    const homeSource = readSource("src/components/HomeLanding.tsx");
    const navSource = readSource("src/components/Navbar.tsx");
    const authSource = readSource("src/components/AuthView.tsx");

    expect(homeSource).toContain("/brand/flowcart-background.png");
    expect(navSource).toContain("/brand/flowcart-logo-clean.png");
    expect(authSource).toContain("/brand/flowcart-logo-clean.png");
  });

  it("uses the shared LiquidButton primitive for major action labels", () => {
    const dashboardSource = readSource("app/dashboard/page.tsx");
    const settingsSource = readSource("app/settings/page.tsx");
    const bucketSource = readSource("src/components/ProductBucket.tsx");

    expect(dashboardSource).toMatch(/<LiquidButton[\s\S]*Create Bucket/);
    expect(dashboardSource).toMatch(/<LiquidButton[\s\S]*GO ALL/);
    expect(settingsSource).toMatch(/<LiquidButton[\s\S]*Reconnect Shopify|Connect Shopify/);
    expect(settingsSource).toMatch(/<LiquidButton[\s\S]*Validate Connection/);
    expect(settingsSource).toMatch(/<LiquidButton[\s\S]*Disconnect Instagram/);
    expect(bucketSource).toMatch(/<LiquidButton[\s\S]*Sync Updates/);
    expect(bucketSource).toMatch(/<LiquidButton[\s\S]*\bGO\b/);
    expect(bucketSource).toMatch(/<LiquidButton[\s\S]*\bEdit\b/);
  });

  it("keeps settings ripple visuals gated behind active async states only", () => {
    const settingsSource = readSource("app/settings/page.tsx");

    expect(settingsSource).toContain("{isConnectingShopify ? <RippleCircles compact /> : null}");
    expect(settingsSource).toContain("{isConnectingInstagram || isValidatingInstagram ? (");
  });

  it("auto-refreshes dashboard buckets while GO ALL or active processing is in progress", () => {
    const dashboardSource = readSource("app/dashboard/page.tsx");

    expect(dashboardSource).toContain("hasActiveBucketWork(buckets)");
    expect(dashboardSource).toContain("const shouldAutoRefreshBuckets = isRunningGoAll || hasActiveProcessingBuckets;");
    expect(dashboardSource).toContain("if (authLoading || !user || !shouldAutoRefreshBuckets) {");
    expect(dashboardSource).toContain("window.setTimeout(() => {");
    expect(dashboardSource).toContain("getBucketPollIntervalMs(isRunningGoAll)");
    expect(dashboardSource).toContain("markBucketsProcessingForGoAll");
    expect(dashboardSource).toContain("runBoundedQueue(targetBucketIds, GO_ALL_CONCURRENCY_LIMIT");
  });

  it("renders DONE sync acknowledgement as structured status chips instead of raw paragraph text", () => {
    const dashboardSource = readSource("app/dashboard/page.tsx");
    const bucketSource = readSource("src/components/ProductBucket.tsx");
    const workflowSource = readSource("src/lib/server/workflows.ts");

    expect(dashboardSource).toContain("doneSyncChips");
    expect(bucketSource).toContain("doneSyncChips");
    expect(bucketSource).toContain("syncChipClassName");
    expect(bucketSource).toContain("chip.label");
    expect(workflowSource).toContain("label: \"Reconnect Shopify\"");
    expect(bucketSource).not.toContain("doneSyncMessage");
    expect(bucketSource).not.toContain("Instagram edit-in-place is unsupported for this published post path.");
  });

  it("keeps the homepage scroll story path aligned and responsive", () => {
    const scrollSource = readSource("src/components/ui/svg-follow-scroll.tsx");

    expect(scrollSource).toContain("h-[220vh]");
    expect(scrollSource).toContain("sticky top-20");
    expect(scrollSource).toContain("lg:grid-cols-[minmax(220px,280px)_1fr]");
    expect(scrollSource).toContain("M40 78 C130 78");
  });
});
