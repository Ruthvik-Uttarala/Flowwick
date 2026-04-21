import crypto from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ConnectionSettings, ProductBucket } from "@/src/lib/types";
import {
  isShopifyAppLaunch,
  shouldAutostartStandaloneShopifyConnect,
} from "@/src/lib/shopify";

vi.mock("@/src/lib/server/auth", () => ({
  extractUserId: vi.fn(),
}));

let settingsStore: ConnectionSettings;
let oauthStateStore = new Map<
  string,
  {
    state: string;
    user_id: string;
    shop_domain: string;
    created_at: string;
    expires_at: string;
  }
>();
let bucketStore: ProductBucket;

vi.mock("@/src/lib/server/db-settings", () => ({
  getDbSettings: vi.fn(async () => settingsStore),
  saveDbSettings: vi.fn(async (_userId: string, incoming: Partial<ConnectionSettings>) => {
    const nextDomain = incoming.shopifyStoreDomain?.trim() ?? settingsStore.shopifyStoreDomain;
    const domainChanged = nextDomain !== settingsStore.shopifyStoreDomain;
    settingsStore = {
      shopifyStoreDomain: nextDomain,
      shopifyAdminToken: domainChanged ? "" : settingsStore.shopifyAdminToken,
      instagramAccessToken:
        incoming.instagramAccessToken?.trim() ?? settingsStore.instagramAccessToken,
      instagramBusinessAccountId:
        incoming.instagramBusinessAccountId?.trim() ??
        settingsStore.instagramBusinessAccountId,
    };
    return settingsStore;
  }),
  saveShopifyAdminToken: vi.fn(async (_userId: string, shopDomain: string, adminToken: string) => {
    settingsStore = {
      ...settingsStore,
      shopifyStoreDomain: shopDomain,
      shopifyAdminToken: adminToken,
    };
    return settingsStore;
  }),
  clearShopifyAdminToken: vi.fn(async () => {
    settingsStore = {
      ...settingsStore,
      shopifyAdminToken: "",
    };
    return settingsStore;
  }),
}));

vi.mock("@/src/lib/server/shopify-oauth-state", () => ({
  ShopifyOauthStatePersistenceError: class ShopifyOauthStatePersistenceError extends Error {
    constructor() {
      super("Shopify connection could not be started. Please refresh and try again.");
    }
  },
  saveShopifyOauthState: vi.fn(async (input: {
    state: string;
    userId: string;
    shopDomain: string;
    createdAt: string;
    expiresAt: string;
  }) => {
    for (const [key, value] of oauthStateStore.entries()) {
      if (value.user_id === input.userId) {
        oauthStateStore.delete(key);
      }
    }

    oauthStateStore.set(input.state, {
      state: input.state,
      user_id: input.userId,
      shop_domain: input.shopDomain,
      created_at: input.createdAt,
      expires_at: input.expiresAt,
    });
  }),
  getShopifyOauthState: vi.fn(async (state: string) => oauthStateStore.get(state) ?? null),
  deleteShopifyOauthState: vi.fn(async (state: string) => {
    oauthStateStore.delete(state);
  }),
}));

vi.mock("@/src/lib/server/buckets", () => ({
  getBucketById: vi.fn(async () => bucketStore),
  createBucket: vi.fn(async () => bucketStore),
  getBuckets: vi.fn(async () => [bucketStore]),
  updateBucket: vi.fn(async (_bucketId: string, _userId: string, updater: (bucket: ProductBucket) => ProductBucket) => {
    bucketStore = updater(bucketStore);
    return bucketStore;
  }),
}));

vi.mock("@/src/lib/server/adapters/shopify", () => ({
  createShopifyProductArtifact: vi.fn(async (input: {
    settings: ConnectionSettings;
    payload: { title: string };
  }) => {
    if (!input.settings.shopifyAdminToken) {
      return {
        shopifyCreated: false,
        shopifyProductId: "",
        shopifyProductUrl: "",
        adapterMode: "live" as const,
        errorMessage: "Shopify authorization is required before launch.",
      };
    }

    return {
      shopifyCreated: true,
      shopifyProductId: "gid://shopify/Product/1",
      shopifyProductUrl: "https://smbauto.myshopify.com/products/flowcart-hat",
      adapterMode: "live" as const,
      errorMessage: "",
      shopifyImageUrl: "https://cdn.example/hat.jpg",
    };
  }),
  updateShopifyProductArtifact: vi.fn(async () => ({
    shopifyCreated: true,
    shopifyProductId: "gid://shopify/Product/1",
    shopifyProductUrl: "https://smbauto.myshopify.com/products/flowcart-hat",
    adapterMode: "live" as const,
    errorMessage: "",
    shopifyImageUrl: "https://cdn.example/hat.jpg",
  })),
}));

vi.mock("@/src/lib/server/adapters/instagram", () => ({
  publishInstagramPostArtifact: vi.fn(async () => ({
    instagramPublished: true,
    instagramPostId: "ig-post-1",
    instagramPostUrl: "https://instagram.example/p/1",
    adapterMode: "live" as const,
    errorMessage: "",
  })),
  updateInstagramPostArtifact: vi.fn(async () => ({
    instagramUpdated: false,
    instagramPostId: "ig-post-1",
    instagramPostUrl: "https://instagram.example/p/1",
    outcome: "unchanged" as const,
    reason: "unsupported_edit_path" as const,
    errorMessage: "Published post can't be edited in place for this media type.",
    mediaType: "CAROUSEL_ALBUM",
    mediaProductType: "FEED",
  })),
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
  code: string;
  shop: string;
  state: string;
  timestamp: string;
}) {
  const params = new URLSearchParams({
    code: input.code,
    shop: input.shop,
    state: input.state,
    timestamp: input.timestamp,
  });

  const pieces = [...params.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`);
  const hmac = crypto
    .createHmac("sha256", process.env.SHOPIFY_CLIENT_SECRET ?? "client-secret")
    .update(pieces.join("&"))
    .digest("hex");
  params.set("hmac", hmac);

  return `https://flowcart.example/api/shopify/callback?${params.toString()}`;
}

describe("shopify production flow contract", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn());

    process.env.SHOPIFY_CLIENT_ID = "client-id";
    process.env.SHOPIFY_CLIENT_SECRET = "client-secret";
    process.env.NEXT_PUBLIC_APP_URL = "https://flowcart.example";
    process.env.INSTAGRAM_ENABLED = "true";

    settingsStore = {
      shopifyStoreDomain: "",
      shopifyAdminToken: "",
      instagramAccessToken: "legacy-ig-token",
      instagramBusinessAccountId: "1789",
    };
    oauthStateStore = new Map();
    bucketStore = {
      id: "bucket-1",
      titleRaw: "FlowCart Hat",
      descriptionRaw: "Warm wool hat",
      titleEnhanced: "FlowCart Hat",
      descriptionEnhanced: "Warm wool hat",
      quantity: 8,
      price: 49.99,
      imageUrls: ["https://public.example/hat.jpg"],
      status: "READY",
      shopifyCreated: false,
      shopifyProductId: "",
      shopifyProductUrl: "",
      instagramPublished: false,
      instagramPostId: "",
      instagramPostUrl: "",
      errorMessage: "",
      trashedAt: "",
      deleteAfterAt: "",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  });

  it("verifies the production settings -> standalone connect -> callback -> readiness -> launch flow", async () => {
    const { extractUserId } = await import("@/src/lib/server/auth");
    const { verifyShopifyAdminToken } = await import("@/src/lib/server/shopify");
    const { createShopifyProductArtifact } = await import("@/src/lib/server/adapters/shopify");
    vi.mocked(extractUserId).mockResolvedValue("user-123");
    vi.mocked(verifyShopifyAdminToken).mockResolvedValue(true);
    vi.mocked(global.fetch).mockResolvedValue(
      new Response(JSON.stringify({ access_token: "verified-token" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const { POST: saveSettings } = await import("@/app/api/settings/save/route");
    const saveResponse = await saveSettings(
      new Request("https://flowcart.example/api/settings/save", {
        method: "POST",
        headers: { "Content-Type": "application/json", host: "flowcart.example" },
        body: JSON.stringify({
          shopifyStoreDomain: "smbauto.myshopify.com",
        }),
      })
    );
    const savePayload = await saveResponse.json();
    expect(saveResponse.status).toBe(200);
    expect(savePayload.data.status).toMatchObject({
      shopifyConnected: false,
      shopifyReauthorizationRequired: true,
      readyForLaunch: false,
    });

    const { GET: connectShopify } = await import("@/app/api/shopify/connect/route");
    const connectResponse = await connectShopify(
      new Request("https://flowcart.example/api/shopify/connect?shopDomain=smbauto", {
        method: "GET",
        headers: { host: "flowcart.example" },
      })
    );
    expect(connectResponse.status).toBe(307);
    const installLocation = connectResponse.headers.get("location") ?? "";
    expect(installLocation).toContain("https://smbauto.myshopify.com/admin/oauth/authorize");

    const installUrl = new URL(installLocation);
    const state = installUrl.searchParams.get("state") ?? "";
    expect(state).not.toBe("");
    expect(oauthStateStore.get(state)?.shop_domain).toBe("smbauto.myshopify.com");

    const appLaunchParams = new URLSearchParams({
      host: "YWRtaW4uc2hvcGlmeS5jb20vc3RvcmUvc21iYXV0bw==",
      hmac: "launch-hmac",
      embedded: "1",
      shop: "smbauto.myshopify.com",
    });
    expect(isShopifyAppLaunch(appLaunchParams)).toBe(true);
    expect(shouldAutostartStandaloneShopifyConnect(appLaunchParams)).toBe(false);
    expect(settingsStore.shopifyAdminToken).toBe("");

    const { GET: handleCallback } = await import("@/app/api/shopify/callback/route");
    const callbackResponse = await handleCallback(
      new Request(
        buildSignedCallbackUrl({
          code: "auth-code",
          shop: "smbauto.myshopify.com",
          state,
          timestamp: "1712345678",
        })
      )
    );
    expect(callbackResponse.headers.get("location")).toContain("shopify_connected=true");
    expect(settingsStore.shopifyAdminToken).toBe("verified-token");
    expect(callbackResponse.headers.get("location")).not.toContain("store_domain_mismatch");
    expect(oauthStateStore.has(state)).toBe(false);

    const { GET: getSettings } = await import("@/app/api/settings/route");
    const settingsResponse = await getSettings(
      new Request("https://flowcart.example/api/settings", {
        headers: { host: "flowcart.example" },
      })
    );
    const settingsPayload = await settingsResponse.json();
    expect(settingsResponse.status).toBe(200);
    expect(settingsPayload.data.status).toMatchObject({
      shopifyConnected: true,
      shopifyReauthorizationRequired: false,
      readyForLaunch: true,
    });

    const { POST: goBucket } = await import("@/app/api/buckets/[id]/go/route");
    const goResponse = await goBucket(
      new Request("https://flowcart.example/api/buckets/bucket-1/go", {
        method: "POST",
        headers: { host: "flowcart.example" },
      }),
      { params: Promise.resolve({ id: "bucket-1" }) }
    );
    const goPayload = await goResponse.json();
    expect(goResponse.status).toBe(200);
    expect(goPayload.data.success).toBe(true);
    expect(goPayload.data.bucket.status).toBe("DONE");
    expect(goPayload.data.message).toBe("Launch completed.");
    expect(goPayload.data.message).not.toContain("Admin API Access Token is missing");
    expect(vi.mocked(createShopifyProductArtifact).mock.calls[0]?.[0]).toMatchObject({
      settings: {
        shopifyAdminToken: "verified-token",
      },
    });
  });
});
