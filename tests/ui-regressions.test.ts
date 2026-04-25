import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function readSource(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), "utf8");
}

describe("ui regressions", () => {
  it("defines the FlowCart Instagram-style brand token system in globals.css", () => {
    const globalsSource = readSource("app/globals.css");

    // Instagram action blue is the primary CTA color.
    expect(globalsSource).toContain("--fc-primary: #0095f6;");
    // Purple/pink/orange Instagram gradient stops.
    expect(globalsSource).toContain("--fc-secondary: #833ab4;");
    expect(globalsSource).toContain("--fc-accent: #fd1d1d;");
    // Clean white canvas.
    expect(globalsSource).toContain("--fc-background: #ffffff;");
    // Instagram dark text and friendly status colors.
    expect(globalsSource).toContain("--fc-text-primary: #262626;");
    expect(globalsSource).toContain("--fc-success: #46a96f;");
    expect(globalsSource).toContain("--fc-error: #ed4956;");
    expect(globalsSource).toContain("--fc-highlight: #fcaf45;");
  });

  it("keeps homepage brand assets wired into the real app surfaces", () => {
    const homeSource = readSource("src/components/HomeLanding.tsx");
    const navSource = readSource("src/components/Navbar.tsx");
    const authSource = readSource("src/components/AuthView.tsx");

    expect(homeSource).toContain("/brand/flowcart-background.png");
    expect(navSource).toContain("/brand/flowcart-logo-clean.png");
    expect(authSource).toContain("/brand/flowcart-logo-clean.png");
  });

  it("uses the shared LiquidButton primitive for the Instagram-style action labels", () => {
    const dashboardSource = readSource("app/dashboard/page.tsx");
    const settingsSource = readSource("app/settings/page.tsx");
    const bucketSource = readSource("src/components/ProductBucket.tsx");
    const buttonSource = readSource("src/components/ui/liquid-glass-button.tsx");

    // Dashboard primary CTAs are the renamed Instagram-friendly actions.
    expect(dashboardSource).toMatch(/<LiquidButton[\s\S]*Create Post/);
    expect(dashboardSource).toMatch(/<LiquidButton[\s\S]*Post All/);
    // Settings button labels are unchanged backend-named flows.
    expect(settingsSource).toMatch(/<LiquidButton[\s\S]*Reconnect Shopify|Connect Shopify/);
    expect(settingsSource).toMatch(/<LiquidButton[\s\S]*Validate Connection/);
    expect(settingsSource).toMatch(/<LiquidButton[\s\S]*Disconnect Instagram/);
    // Post card uses Update Post / Post / Edit as the primary action verbs.
    expect(bucketSource).toMatch(/<LiquidButton[\s\S]*Update Post/);
    expect(bucketSource).toMatch(/<LiquidButton[\s\S]*\bPost\b/);
    expect(bucketSource).toMatch(/<LiquidButton[\s\S]*\bEdit\b/);
    // The button primitive uses Instagram blue + Instagram red (no SaaS gradient).
    expect(buttonSource).toContain("bg-[#0095f6]");
    expect(buttonSource).toContain("bg-[#ed4956]");
    expect(buttonSource).not.toContain("bg-[linear-gradient(158deg,#101010,#000)]");
    expect(buttonSource).not.toContain("bg-[linear-gradient(155deg,#0f6cbd_0%,#0c5fa8_58%,#0a4f8a_100%)]");
  });

  it("keeps settings ripple visuals gated behind active async states only", () => {
    const settingsSource = readSource("app/settings/page.tsx");

    expect(settingsSource).toContain("{isConnectingShopify ? <RippleCircles compact /> : null}");
    expect(settingsSource).toContain("{isConnectingInstagram || isValidatingInstagram ? (");
  });

  it("auto-refreshes dashboard posts while Post All or active processing is in progress", () => {
    const dashboardSource = readSource("app/dashboard/page.tsx");

    expect(dashboardSource).toContain("hasActiveBucketWork(buckets)");
    expect(dashboardSource).toContain("const shouldAutoRefreshBuckets = isRunningGoAll || hasActiveProcessingBuckets;");
    expect(dashboardSource).toContain("if (authLoading || !user || !shouldAutoRefreshBuckets) {");
    expect(dashboardSource).toContain("window.setTimeout(() => {");
    expect(dashboardSource).toContain("getBucketPollIntervalMs(isRunningGoAll)");
    expect(dashboardSource).toContain("markBucketsProcessingForGoAll");
    expect(dashboardSource).toContain("runBoundedQueue(targetBucketIds, GO_ALL_CONCURRENCY_LIMIT");
  });

  it("renders posted post update acknowledgement as structured status chips instead of raw paragraph text", () => {
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

    expect(scrollSource).toContain("offset: [\"start 85%\", \"end 30%\"]");
    expect(scrollSource).toContain("sticky top-24");
    expect(scrollSource).toContain("lg:grid-cols-[220px_1fr]");
    expect(scrollSource).toContain("origin-top");
    expect(scrollSource).not.toContain("h-[220vh]");
  });
});
