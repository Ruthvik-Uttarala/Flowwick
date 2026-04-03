import { beforeEach, describe, expect, it, vi } from "vitest";
import { SHOPIFY_OAUTH_SCOPE_PARAM } from "@/src/lib/shopify";

vi.mock("@/src/lib/server/auth", () => ({
  extractUserId: vi.fn(),
}));

vi.mock("@/src/lib/server/db-settings", () => ({
  getDbSettings: vi.fn(),
  saveDbSettings: vi.fn(),
}));

vi.mock("@/src/lib/server/shopify-oauth-state", () => ({
  saveShopifyOauthState: vi.fn(),
}));

describe("POST /api/shopify/connect", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.SHOPIFY_CLIENT_ID = "client-id-123";
    process.env.SHOPIFY_CLIENT_SECRET = "client-secret-123";
    process.env.NEXT_PUBLIC_APP_URL = "https://flowcart.example";
  });

  it("persists a changed normalized domain before building the OAuth URL", async () => {
    const { extractUserId } = await import("@/src/lib/server/auth");
    const { getDbSettings, saveDbSettings } = await import("@/src/lib/server/db-settings");
    const { saveShopifyOauthState } = await import("@/src/lib/server/shopify-oauth-state");

    vi.mocked(extractUserId).mockResolvedValue("user-123");
    vi.mocked(getDbSettings).mockResolvedValue({
      shopifyStoreDomain: "old-shop.myshopify.com",
      shopifyAdminToken: "old-token",
      instagramAccessToken: "",
      instagramBusinessAccountId: "",
    });
    vi.mocked(saveDbSettings).mockResolvedValue({
      shopifyStoreDomain: "new-shop.myshopify.com",
      shopifyAdminToken: "",
      instagramAccessToken: "",
      instagramBusinessAccountId: "",
    });

    const { POST } = await import("@/app/api/shopify/connect/route");
    const response = await POST(
      new Request("https://flowcart.example/api/shopify/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shopDomain: "new-shop" }),
      })
    );

    const payload = (await response.json()) as {
      ok: boolean;
      data?: { installUrl?: string };
    };

    expect(response.status).toBe(200);
    expect(payload.data?.installUrl).toContain("https://new-shop.myshopify.com/admin/oauth/authorize");
    expect(payload.data?.installUrl).toContain(`client_id=${process.env.SHOPIFY_CLIENT_ID}`);
    expect(payload.data?.installUrl).toContain(
      `scope=${encodeURIComponent(SHOPIFY_OAUTH_SCOPE_PARAM)}`
    );
    expect(saveDbSettings).toHaveBeenCalledWith("user-123", {
      shopifyStoreDomain: "new-shop.myshopify.com",
    });
    expect(saveShopifyOauthState).toHaveBeenCalledOnce();
    expect(response.headers.get("set-cookie")).toContain("flowcart-shopify-oauth-state=");
  });
});
