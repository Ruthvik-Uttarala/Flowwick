import { beforeEach, describe, expect, it, vi } from "vitest";
import { SHOPIFY_OAUTH_SCOPE_PARAM } from "@/src/lib/shopify";

vi.mock("@/src/lib/server/auth", () => ({
  extractUserId: vi.fn(),
}));

vi.mock("@/src/lib/server/db-settings", () => ({
  getDbSettings: vi.fn(),
  saveDbSettings: vi.fn(),
}));

vi.mock("@/src/lib/server/shopify-oauth-state", () => {
  class ShopifyOauthStatePersistenceError extends Error {
    constructor() {
      super("Shopify connection could not be started. Please refresh and try again.");
    }
  }

  return {
    ShopifyOauthStatePersistenceError,
    saveShopifyOauthState: vi.fn(),
  };
});

describe("POST /api/shopify/connect", () => {
  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.SHOPIFY_CLIENT_ID = "client-id-123";
    process.env.SHOPIFY_CLIENT_SECRET = "client-secret-123";
    process.env.NEXT_PUBLIC_APP_URL = "https://flowcart.example";

    const { getDbSettings, saveDbSettings } = await import("@/src/lib/server/db-settings");
    vi.mocked(getDbSettings).mockResolvedValue({
      shopifyStoreDomain: "demo.myshopify.com",
      shopifyAdminToken: "",
      instagramAccessToken: "",
      instagramBusinessAccountId: "",
    });
    vi.mocked(saveDbSettings).mockResolvedValue({
      shopifyStoreDomain: "demo.myshopify.com",
      shopifyAdminToken: "",
      instagramAccessToken: "",
      instagramBusinessAccountId: "",
    });
  });

  it("returns a valid installUrl only on the authoritative production host", async () => {
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
        headers: { "Content-Type": "application/json", host: "flowcart.example" },
        body: JSON.stringify({ shopDomain: "new-shop" }),
      })
    );

    const payload = (await response.json()) as {
      ok: boolean;
      data?: { installUrl?: string };
    };

    expect(response.status).toBe(200);
    expect(payload.data?.installUrl).toContain(
      "https://new-shop.myshopify.com/admin/oauth/authorize"
    );
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

  it("rejects preview or non-authoritative hosts before state creation", async () => {
    const { extractUserId } = await import("@/src/lib/server/auth");
    const { saveShopifyOauthState } = await import("@/src/lib/server/shopify-oauth-state");
    vi.mocked(extractUserId).mockResolvedValue("user-123");

    const { POST } = await import("@/app/api/shopify/connect/route");
    const response = await POST(
      new Request("https://preview-flowcart.vercel.app/api/shopify/connect", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          host: "preview-flowcart.vercel.app",
        },
        body: JSON.stringify({ shopDomain: "demo-shop" }),
      })
    );

    const payload = (await response.json()) as {
      ok: boolean;
      data?: { code?: string; productionSettingsUrl?: string };
      error?: { message?: string };
    };

    expect(response.status).toBe(409);
    expect(payload.ok).toBe(false);
    expect(payload.data).toMatchObject({
      code: "app_url_mismatch",
      productionSettingsUrl:
        "https://flowcart.example/settings?shopify_error=app_url_mismatch",
    });
    expect(payload.error?.message).toContain("production FlowCart URL");
    expect(saveShopifyOauthState).not.toHaveBeenCalled();
  });

  it("returns 401 when unauthenticated", async () => {
    const { extractUserId } = await import("@/src/lib/server/auth");
    vi.mocked(extractUserId).mockResolvedValue(null);

    const { POST } = await import("@/app/api/shopify/connect/route");
    const response = await POST(
      new Request("https://flowcart.example/api/shopify/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json", host: "flowcart.example" },
        body: JSON.stringify({ shopDomain: "demo-shop" }),
      })
    );

    expect(response.status).toBe(401);
  });

  it("returns 400 for an invalid shop domain", async () => {
    const { extractUserId } = await import("@/src/lib/server/auth");
    vi.mocked(extractUserId).mockResolvedValue("user-123");

    const { POST } = await import("@/app/api/shopify/connect/route");
    const response = await POST(
      new Request("https://flowcart.example/api/shopify/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json", host: "flowcart.example" },
        body: JSON.stringify({ shopDomain: "example.com" }),
      })
    );

    const payload = await response.json();
    expect(response.status).toBe(400);
    expect(payload.error?.message).toContain("valid Shopify store domain");
  });

  it("returns 500 when Shopify env credentials are missing", async () => {
    const { extractUserId } = await import("@/src/lib/server/auth");
    vi.mocked(extractUserId).mockResolvedValue("user-123");
    delete process.env.SHOPIFY_CLIENT_ID;

    const { POST } = await import("@/app/api/shopify/connect/route");
    const response = await POST(
      new Request("https://flowcart.example/api/shopify/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json", host: "flowcart.example" },
        body: JSON.stringify({ shopDomain: "demo-shop" }),
      })
    );

    const payload = await response.json();
    expect(response.status).toBe(500);
    expect(payload.error?.message).toContain("not configured");
  });

  it("sanitizes oauth state persistence failures for the browser", async () => {
    const { extractUserId } = await import("@/src/lib/server/auth");
    const { saveShopifyOauthState, ShopifyOauthStatePersistenceError } = await import(
      "@/src/lib/server/shopify-oauth-state"
    );
    vi.mocked(extractUserId).mockResolvedValue("user-123");
    vi.mocked(saveShopifyOauthState).mockRejectedValue(new ShopifyOauthStatePersistenceError());

    const { POST } = await import("@/app/api/shopify/connect/route");
    const response = await POST(
      new Request("https://flowcart.example/api/shopify/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json", host: "flowcart.example" },
        body: JSON.stringify({ shopDomain: "demo-shop" }),
      })
    );

    const payload = (await response.json()) as {
      ok: boolean;
      data?: { code?: string };
      error?: { message?: string };
    };

    expect(response.status).toBe(500);
    expect(payload.data?.code).toBe("oauth_state_persist_failed");
    expect(payload.error?.message).toBe(
      "Shopify connection could not be started. Please refresh and try again."
    );
  });
});
