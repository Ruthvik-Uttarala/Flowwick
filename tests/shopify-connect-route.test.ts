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

describe("Shopify connect route", () => {
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

  it("starts standalone OAuth with a top-level GET redirect on the authoritative host", async () => {
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

    const { GET } = await import("@/app/api/shopify/connect/route");
    const response = await GET(
      new Request("https://flowcart.example/api/shopify/connect?shopDomain=new-shop", {
        method: "GET",
        headers: { host: "flowcart.example" },
      })
    );

    expect(response.status).toBe(307);
    const location = response.headers.get("location") ?? "";
    expect(location).toContain("https://new-shop.myshopify.com/admin/oauth/authorize");
    expect(location).toContain(`client_id=${process.env.SHOPIFY_CLIENT_ID}`);
    expect(location).toContain(
      `scope=${encodeURIComponent(SHOPIFY_OAUTH_SCOPE_PARAM)}`
    );
    expect(saveDbSettings).toHaveBeenCalledWith("user-123", {
      shopifyStoreDomain: "new-shop.myshopify.com",
    });
    expect(saveShopifyOauthState).toHaveBeenCalledOnce();
    expect(response.headers.get("set-cookie")).toContain("flowcart-shopify-oauth-state=");
  });

  it("redirects preview or non-authoritative hosts back to production settings before state creation", async () => {
    const { extractUserId } = await import("@/src/lib/server/auth");
    const { saveShopifyOauthState } = await import("@/src/lib/server/shopify-oauth-state");
    vi.mocked(extractUserId).mockResolvedValue("user-123");

    const { GET } = await import("@/app/api/shopify/connect/route");
    const response = await GET(
      new Request(
        "https://preview-flowcart.vercel.app/api/shopify/connect?shopDomain=smbauto",
        {
          method: "GET",
          headers: { host: "preview-flowcart.vercel.app" },
        }
      )
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://flowcart.example/settings?shopify_error=app_url_mismatch&shopify_connect=1&shopDomain=smbauto.myshopify.com"
    );
    expect(saveShopifyOauthState).not.toHaveBeenCalled();
  });

  it("breaks unsupported embedded/admin context back out to standalone settings", async () => {
    const { extractUserId } = await import("@/src/lib/server/auth");
    const { saveShopifyOauthState } = await import("@/src/lib/server/shopify-oauth-state");
    vi.mocked(extractUserId).mockResolvedValue("user-123");

    const { GET } = await import("@/app/api/shopify/connect/route");
    const response = await GET(
      new Request(
        "https://flowcart.example/api/shopify/connect?shopDomain=smbauto&embedded=1&host=YWRtaW4uc2hvcGlmeS5jb20vc3RvcmUvc21iYXV0bw==",
        {
          method: "GET",
          headers: {
            host: "flowcart.example",
            referer: "https://admin.shopify.com/store/smbauto/apps/flowcart",
            "sec-fetch-dest": "iframe",
          },
        }
      )
    );

    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain("window.top.location.href");
    expect(html).toContain(
      "https://flowcart.example/settings?shopify_error=unsupported_shopify_context&shopify_connect=1&shopDomain=smbauto.myshopify.com"
    );
    expect(saveShopifyOauthState).not.toHaveBeenCalled();
  });

  it("returns 401 when unauthenticated", async () => {
    const { extractUserId } = await import("@/src/lib/server/auth");
    vi.mocked(extractUserId).mockResolvedValue(null);

    const { GET } = await import("@/app/api/shopify/connect/route");
    const response = await GET(
      new Request("https://flowcart.example/api/shopify/connect?shopDomain=demo-shop", {
        method: "GET",
        headers: { host: "flowcart.example" },
      })
    );

    expect(response.status).toBe(401);
  });

  it("returns 400 for an invalid shop domain", async () => {
    const { extractUserId } = await import("@/src/lib/server/auth");
    vi.mocked(extractUserId).mockResolvedValue("user-123");

    const { GET } = await import("@/app/api/shopify/connect/route");
    const response = await GET(
      new Request("https://flowcart.example/api/shopify/connect?shopDomain=example.com", {
        method: "GET",
        headers: { host: "flowcart.example" },
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

    const { GET } = await import("@/app/api/shopify/connect/route");
    const response = await GET(
      new Request("https://flowcart.example/api/shopify/connect?shopDomain=demo-shop", {
        method: "GET",
        headers: { host: "flowcart.example" },
      })
    );

    const payload = await response.json();
    expect(response.status).toBe(500);
    expect(payload.error?.message).toContain("not configured");
  });

  it("keeps POST as a compatibility path with structured standalone errors", async () => {
    const { extractUserId } = await import("@/src/lib/server/auth");
    vi.mocked(extractUserId).mockResolvedValue("user-123");

    const { POST } = await import("@/app/api/shopify/connect/route");
    const response = await POST(
      new Request("https://flowcart.example/api/shopify/connect?embedded=1", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          host: "flowcart.example",
          referer: "https://admin.shopify.com/store/smbauto/apps/flowcart",
        },
        body: JSON.stringify({ shopDomain: "smbauto" }),
      })
    );

    const payload = (await response.json()) as {
      ok: boolean;
      data?: { code?: string; productionSettingsUrl?: string };
      error?: { message?: string };
    };

    expect(response.status).toBe(409);
    expect(payload.data).toMatchObject({
      code: "unsupported_shopify_context",
      productionSettingsUrl:
        "https://flowcart.example/settings?shopify_error=unsupported_shopify_context&shopify_connect=1&shopDomain=smbauto.myshopify.com",
    });
    expect(payload.error?.message).toContain("standalone FlowCart settings page");
  });

  it("sanitizes oauth state persistence failures for the browser", async () => {
    const { extractUserId } = await import("@/src/lib/server/auth");
    const { saveShopifyOauthState, ShopifyOauthStatePersistenceError } = await import(
      "@/src/lib/server/shopify-oauth-state"
    );
    vi.mocked(extractUserId).mockResolvedValue("user-123");
    vi.mocked(saveShopifyOauthState).mockRejectedValue(new ShopifyOauthStatePersistenceError());

    const { GET } = await import("@/app/api/shopify/connect/route");
    const response = await GET(
      new Request("https://flowcart.example/api/shopify/connect?shopDomain=smbauto", {
        method: "GET",
        headers: { host: "flowcart.example" },
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
