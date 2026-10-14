import { beforeEach, describe, expect, it, vi } from "vitest";

const extractUserId = vi.fn();
const getDbSettings = vi.fn();

vi.mock("@/src/lib/server/auth", () => ({ extractUserId }));
vi.mock("@/src/lib/server/db-settings", () => ({ getDbSettings }));

describe("runtime configuration diagnostics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("OPENAI_API_KEY", "configured-openai-key");
  });

  it("accurately reports Supabase bucket and upload persistence without credentials", async () => {
    const sentinel = "SENSITIVE_VALUE_MUST_NOT_APPEAR";
    const { getRuntimeConfigSnapshot } = await import("@/src/lib/server/config");
    const snapshot = getRuntimeConfigSnapshot({
      shopifyStoreDomain: "demo.myshopify.com",
      shopifyAdminToken: sentinel,
      instagramAccessToken: sentinel,
      instagramBusinessAccountId: "1789",
      instagramUserAccessToken: sentinel,
    });

    expect(snapshot.storage).toEqual({
      persistence: "supabase",
      bucketRecords: "public.buckets",
      uploads: "supabase-storage",
      uploadsBucket: "product_images",
    });
    expect(JSON.stringify(snapshot)).not.toContain(sentinel);
  });

  it("returns a sanitized health error when a dependency throws sensitive details", async () => {
    const sentinel = "SENSITIVE_DATABASE_ERROR";
    extractUserId.mockResolvedValue("user-1");
    getDbSettings.mockRejectedValue(new Error(sentinel));
    const { GET } = await import("@/app/api/health/route");

    const response = await GET(new Request("https://flowwick.vercel.app/api/health"));
    const body = await response.text();
    expect(response.status).toBe(500);
    expect(body).toContain("Health check failed.");
    expect(body).not.toContain(sentinel);
  });
});
