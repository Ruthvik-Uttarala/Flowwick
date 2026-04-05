import crypto from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/src/lib/server/db-settings", () => ({
  getDbSettings: vi.fn(),
  saveShopifyAdminToken: vi.fn(),
  clearShopifyAdminToken: vi.fn(),
}));

vi.mock("@/src/lib/server/shopify-oauth-state", () => ({
  getShopifyOauthState: vi.fn(),
  deleteShopifyOauthState: vi.fn(),
}));

vi.mock("@/src/lib/server/shopify", async () => {
  const actual = await vi.importActual<typeof import("@/src/lib/server/shopify")>(
    "@/src/lib/server/shopify"
  );
  return {
    ...actual,
    verifyShopifyAdminToken: vi.fn(),
  };
});

function buildSignedCallbackUrl(input: {
  baseUrl?: string;
  code?: string;
  shop?: string;
  state?: string;
  timestamp?: string;
  secret?: string;
}) {
  const params = new URLSearchParams();
  if (input.code) params.set("code", input.code);
  if (input.shop) params.set("shop", input.shop);
  if (input.state) params.set("state", input.state);
  if (input.timestamp) params.set("timestamp", input.timestamp);

  const pieces = [...params.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`);
  const hmac = crypto
    .createHmac("sha256", input.secret ?? "client-secret")
    .update(pieces.join("&"))
    .digest("hex");
  params.set("hmac", hmac);

  return `${input.baseUrl ?? "https://flowcart.example"}/api/shopify/callback?${params.toString()}`;
}

describe("GET /api/shopify/callback", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn());
    process.env.SHOPIFY_CLIENT_ID = "client-id";
    process.env.SHOPIFY_CLIENT_SECRET = "client-secret";
    process.env.NEXT_PUBLIC_APP_URL = "https://flowcart.example";
  });

  it("rejects missing callback params", async () => {
    const { GET } = await import("@/app/api/shopify/callback/route");
    const response = await GET(new Request("https://flowcart.example/api/shopify/callback"));
    expect(response.headers.get("location")).toContain("shopify_error=missing_params");
  });

  it("rejects invalid or missing browser state", async () => {
    const { GET } = await import("@/app/api/shopify/callback/route");
    const response = await GET(
      new Request(
        buildSignedCallbackUrl({
          code: "auth-code",
          shop: "demo.myshopify.com",
          state: "expected-state",
          timestamp: "1712345678",
        }),
        {
          headers: { cookie: "flowcart-shopify-oauth-state=wrong-state" },
        }
      )
    );

    expect(response.headers.get("location")).toContain("shopify_error=invalid_state");
  });

  it("rejects expired authorization state", async () => {
    const { getShopifyOauthState } = await import("@/src/lib/server/shopify-oauth-state");
    vi.mocked(getShopifyOauthState).mockResolvedValue({
      state: "expected-state",
      user_id: "user-123",
      shop_domain: "demo.myshopify.com",
      created_at: new Date(Date.now() - 60_000).toISOString(),
      expires_at: new Date(Date.now() - 1_000).toISOString(),
    });

    const { GET } = await import("@/app/api/shopify/callback/route");
    const response = await GET(
      new Request(
        buildSignedCallbackUrl({
          code: "auth-code",
          shop: "demo.myshopify.com",
          state: "expected-state",
          timestamp: "1712345678",
        }),
        {
          headers: { cookie: "flowcart-shopify-oauth-state=expected-state" },
        }
      )
    );

    expect(response.headers.get("location")).toContain("shopify_error=expired_state");
  });

  it("rejects invalid HMAC before token exchange", async () => {
    const { getShopifyOauthState } = await import("@/src/lib/server/shopify-oauth-state");
    vi.mocked(getShopifyOauthState).mockResolvedValue({
      state: "expected-state",
      user_id: "user-123",
      shop_domain: "demo.myshopify.com",
      created_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 60_000).toISOString(),
    });

    const url =
      "https://flowcart.example/api/shopify/callback?code=auth-code&shop=demo.myshopify.com&state=expected-state&timestamp=1712345678&hmac=bad-signature";

    const { GET } = await import("@/app/api/shopify/callback/route");
    const response = await GET(
      new Request(url, {
        headers: { cookie: "flowcart-shopify-oauth-state=expected-state" },
      })
    );

    expect(response.headers.get("location")).toContain("shopify_error=invalid_hmac");
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("rejects callback shop mismatches against stored domain", async () => {
    const { getShopifyOauthState } = await import("@/src/lib/server/shopify-oauth-state");
    const { getDbSettings } = await import("@/src/lib/server/db-settings");
    vi.mocked(getShopifyOauthState).mockResolvedValue({
      state: "expected-state",
      user_id: "user-123",
      shop_domain: "demo.myshopify.com",
      created_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 60_000).toISOString(),
    });
    vi.mocked(getDbSettings).mockResolvedValue({
      shopifyStoreDomain: "other-store.myshopify.com",
      shopifyAdminToken: "",
      instagramAccessToken: "",
      instagramBusinessAccountId: "",
    });

    const { GET } = await import("@/app/api/shopify/callback/route");
    const response = await GET(
      new Request(
        buildSignedCallbackUrl({
          code: "auth-code",
          shop: "demo.myshopify.com",
          state: "expected-state",
          timestamp: "1712345678",
        }),
        {
          headers: { cookie: "flowcart-shopify-oauth-state=expected-state" },
        }
      )
    );

    expect(response.headers.get("location")).toContain("shopify_error=store_domain_mismatch");
  });

  it("stores a verified token and redirects with success", async () => {
    const { getShopifyOauthState, deleteShopifyOauthState } = await import(
      "@/src/lib/server/shopify-oauth-state"
    );
    const { getDbSettings, saveShopifyAdminToken } = await import("@/src/lib/server/db-settings");
    const { verifyShopifyAdminToken } = await import("@/src/lib/server/shopify");

    vi.mocked(getShopifyOauthState).mockResolvedValue({
      state: "expected-state",
      user_id: "user-123",
      shop_domain: "demo.myshopify.com",
      created_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 60_000).toISOString(),
    });
    vi.mocked(getDbSettings).mockResolvedValue({
      shopifyStoreDomain: "demo.myshopify.com",
      shopifyAdminToken: "",
      instagramAccessToken: "",
      instagramBusinessAccountId: "",
    });
    vi.mocked(saveShopifyAdminToken).mockResolvedValue({
      shopifyStoreDomain: "demo.myshopify.com",
      shopifyAdminToken: "verified-token",
      instagramAccessToken: "",
      instagramBusinessAccountId: "",
    });
    vi.mocked(verifyShopifyAdminToken).mockResolvedValue(true);
    vi.mocked(global.fetch).mockResolvedValue(
      new Response(JSON.stringify({ access_token: "verified-token" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const { GET } = await import("@/app/api/shopify/callback/route");
    const response = await GET(
      new Request(
        buildSignedCallbackUrl({
          code: "auth-code",
          shop: "demo.myshopify.com",
          state: "expected-state",
          timestamp: "1712345678",
        }),
        {
          headers: { cookie: "flowcart-shopify-oauth-state=expected-state" },
        }
      )
    );

    expect(saveShopifyAdminToken).toHaveBeenCalledWith(
      "user-123",
      "demo.myshopify.com",
      "verified-token"
    );
    expect(vi.mocked(verifyShopifyAdminToken).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(saveShopifyAdminToken).mock.invocationCallOrder[0]
    );
    expect(deleteShopifyOauthState).toHaveBeenCalledWith("expected-state");
    expect(response.headers.get("location")).toContain("shopify_connected=true");
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
  });

  it("returns token_exchange_failed when Shopify does not return an access token", async () => {
    const { getShopifyOauthState } = await import("@/src/lib/server/shopify-oauth-state");
    const { getDbSettings, saveShopifyAdminToken } = await import("@/src/lib/server/db-settings");
    const { verifyShopifyAdminToken } = await import("@/src/lib/server/shopify");

    vi.mocked(getShopifyOauthState).mockResolvedValue({
      state: "expected-state",
      user_id: "user-123",
      shop_domain: "demo.myshopify.com",
      created_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 60_000).toISOString(),
    });
    vi.mocked(getDbSettings).mockResolvedValue({
      shopifyStoreDomain: "demo.myshopify.com",
      shopifyAdminToken: "",
      instagramAccessToken: "",
      instagramBusinessAccountId: "",
    });
    vi.mocked(global.fetch).mockResolvedValue(
      new Response(JSON.stringify({ access_token: "" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      })
    );

    const { GET } = await import("@/app/api/shopify/callback/route");
    const response = await GET(
      new Request(
        buildSignedCallbackUrl({
          code: "auth-code",
          shop: "demo.myshopify.com",
          state: "expected-state",
          timestamp: "1712345678",
        }),
        {
          headers: { cookie: "flowcart-shopify-oauth-state=expected-state" },
        }
      )
    );

    expect(verifyShopifyAdminToken).not.toHaveBeenCalled();
    expect(saveShopifyAdminToken).not.toHaveBeenCalled();
    expect(response.headers.get("location")).toContain("shopify_error=token_exchange_failed");
  });

  it("does not persist the token if Shopify verification fails", async () => {
    const { getShopifyOauthState } = await import("@/src/lib/server/shopify-oauth-state");
    const { getDbSettings, saveShopifyAdminToken, clearShopifyAdminToken } = await import(
      "@/src/lib/server/db-settings"
    );
    const { verifyShopifyAdminToken } = await import("@/src/lib/server/shopify");

    vi.mocked(getShopifyOauthState).mockResolvedValue({
      state: "expected-state",
      user_id: "user-123",
      shop_domain: "demo.myshopify.com",
      created_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 60_000).toISOString(),
    });
    vi.mocked(getDbSettings).mockResolvedValue({
      shopifyStoreDomain: "demo.myshopify.com",
      shopifyAdminToken: "",
      instagramAccessToken: "",
      instagramBusinessAccountId: "",
    });
    vi.mocked(verifyShopifyAdminToken).mockResolvedValue(false);
    vi.mocked(global.fetch).mockResolvedValue(
      new Response(JSON.stringify({ access_token: "unverified-token" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const { GET } = await import("@/app/api/shopify/callback/route");
    const response = await GET(
      new Request(
        buildSignedCallbackUrl({
          code: "auth-code",
          shop: "demo.myshopify.com",
          state: "expected-state",
          timestamp: "1712345678",
        }),
        {
          headers: { cookie: "flowcart-shopify-oauth-state=expected-state" },
        }
      )
    );

    expect(saveShopifyAdminToken).not.toHaveBeenCalled();
    expect(clearShopifyAdminToken).not.toHaveBeenCalled();
    expect(response.headers.get("location")).toContain(
      "shopify_error=token_verification_failed"
    );
  });
});
