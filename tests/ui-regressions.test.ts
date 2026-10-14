import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function readSource(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), "utf8");
}

describe("ui regressions", () => {
  it("defines the current Flowwick monochrome brand token system in globals.css", () => {
    const globalsSource = readSource("app/globals.css");

    expect(globalsSource).toContain("--fc-primary: #111111;");
    expect(globalsSource).toContain("--fc-background: #fafafa;");
    expect(globalsSource).toContain("--fc-text-primary: #111111;");
    expect(globalsSource).toContain("--fc-success: #16a34a;");
    expect(globalsSource).toContain("--fc-error: #dc2626;");
    expect(globalsSource).toContain("--fc-warning: #b45309;");
  });

  it("keeps homepage brand assets wired into the real app surfaces", () => {
    const homeSource = readSource("src/components/HomeLanding.tsx");
    const navSource = readSource("src/components/Navbar.tsx");
    const authSource = readSource("src/components/AuthView.tsx");

    expect(homeSource).toContain("/brand/flowwick-home-business-value-hero.png");
    expect(navSource).toContain("/brand/flowwick-horizontal.png");
    expect(authSource).toContain("/brand/flowwick-logo-v1.png");
  });

  it("uses the shared LiquidButton primitive for merchant actions", () => {
    const dashboardSource = readSource("app/dashboard/page.tsx");
    const settingsSource = readSource("app/settings/page.tsx");
    const bucketSource = readSource("src/components/ProductBucket.tsx");
    const buttonSource = readSource("src/components/ui/liquid-glass-button.tsx");

    // Dashboard primary CTAs are the renamed Instagram-friendly actions.
    expect(dashboardSource).toMatch(/<LiquidButton[\s\S]*Create Post/);
    expect(dashboardSource).toMatch(/<LiquidButton[\s\S]*Post All/);
    // Settings button labels are unchanged backend-named flows.
    expect(settingsSource).toMatch(/<LiquidButton[\s\S]*Reconnect Shopify|Connect Shopify/);
    expect(settingsSource).toMatch(/<LiquidButton[\s\S]*Check connection/);
    expect(settingsSource).toMatch(/<LiquidButton[\s\S]*Disconnect Instagram/);
    // Post card uses Update Post / Post / Edit as the primary action verbs.
    expect(bucketSource).toMatch(/<LiquidButton[\s\S]*Update Post/);
    expect(bucketSource).toMatch(/<LiquidButton[\s\S]*\bPost\b/);
    expect(bucketSource).toMatch(/<LiquidButton[\s\S]*\bEdit\b/);
    // The current button primitive uses the approved restrained monochrome palette.
    expect(buttonSource).toContain("bg-[#111111]");
    expect(buttonSource).toContain("bg-[#16a34a]");
    expect(buttonSource).not.toContain("bg-[linear-gradient(158deg,#101010,#000)]");
    expect(buttonSource).not.toContain("bg-[linear-gradient(155deg,#0f6cbd_0%,#0c5fa8_58%,#0a4f8a_100%)]");
  });

  it("shows progress indicators only during active settings operations", () => {
    const settingsSource = readSource("app/settings/page.tsx");

    expect(settingsSource).toMatch(/isConnectingShopify[\s\S]*Loader2[\s\S]*Connecting\.\.\./);
    expect(settingsSource).toMatch(/isConnectingInstagram[\s\S]*Loader2[\s\S]*Connecting\.\.\./);
    expect(settingsSource).toMatch(/isValidatingInstagram[\s\S]*Loader2[\s\S]*Checking\.\.\./);
  });

  it("auto-refreshes dashboard posts while Post All or active processing is in progress", () => {
    const dashboardSource = readSource("app/dashboard/page.tsx");

    expect(dashboardSource).toContain("hasActiveBucketWork(buckets)");
    expect(dashboardSource).toContain("const hasActiveProcessingBuckets = useMemo(() => hasActiveBucketWork(buckets)");
    expect(dashboardSource).toContain("if (authLoading || !user || (!isRunningGoAll && !hasActiveProcessingBuckets)) {");
    expect(dashboardSource).toContain("window.setTimeout(() => {");
    expect(dashboardSource).toContain("getBucketPollIntervalMs(isRunningGoAll)");
    expect(dashboardSource).toContain('fetch("/api/buckets/go-all", { method: "POST" })');
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
