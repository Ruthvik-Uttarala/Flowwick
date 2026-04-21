import { beforeEach, describe, expect, it, vi } from "vitest";
import { ActiveInstagramCredentials, ProductBucket } from "@/src/lib/types";

vi.mock("@/src/lib/server/buckets", () => ({
  getBucketById: vi.fn(),
  createBucket: vi.fn(),
  updateBucket: vi.fn(),
  getBuckets: vi.fn(),
}));

vi.mock("@/src/lib/server/openai", () => ({
  enhanceTitleViaOpenAI: vi.fn(),
  enhanceDescriptionViaOpenAI: vi.fn(),
}));

vi.mock("@/src/lib/server/adapters/shopify", () => ({
  createShopifyProductArtifact: vi.fn(),
  updateShopifyProductArtifact: vi.fn(),
}));

vi.mock("@/src/lib/server/adapters/instagram", () => ({
  publishInstagramPostArtifact: vi.fn(),
  updateInstagramPostArtifact: vi.fn(),
}));

function makeBucket(id: string, overrides: Partial<ProductBucket> = {}): ProductBucket {
  const now = new Date().toISOString();
  return {
    id,
    titleRaw: "FlowCart Hat",
    descriptionRaw: "Warm wool hat",
    titleEnhanced: "",
    descriptionEnhanced: "",
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
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

const resolvedInstagramCredentials: ActiveInstagramCredentials = {
  status: "connected",
  source: "oauth_cached_page_token",
  pageId: "page-1",
  pageName: "FlowCart Page",
  instagramBusinessAccountId: "ig-business-1",
  publishAccessToken: "resolved-page-token",
  hasLongLivedUserToken: true,
};

describe("launch workflow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "info").mockImplementation(() => undefined);
  });

  it("skips Instagram when Shopify product creation fails", async () => {
    const { getBucketById, updateBucket } = await import("@/src/lib/server/buckets");
    const { createShopifyProductArtifact } = await import("@/src/lib/server/adapters/shopify");
    const { publishInstagramPostArtifact } = await import(
      "@/src/lib/server/adapters/instagram"
    );

    let currentBucket = makeBucket("bucket-1");

    vi.mocked(getBucketById).mockImplementation(async () => currentBucket);
    vi.mocked(updateBucket).mockImplementation(async (_bucketId, _userId, updater) => {
      currentBucket = updater(currentBucket);
      return currentBucket;
    });
    vi.mocked(createShopifyProductArtifact).mockResolvedValue({
      shopifyCreated: false,
      shopifyProductId: "",
      shopifyProductUrl: "",
      adapterMode: "live",
      errorMessage: "Shopify request failed.",
    });

    const { launchBucket } = await import("@/src/lib/server/workflows");
    const result = await launchBucket("bucket-1", "user-1", {
      shopifyStoreDomain: "demo.myshopify.com",
      shopifyAdminToken: "shpca_live",
      instagramAccessToken: "ig-token",
      instagramBusinessAccountId: "1789",
    });

    expect(publishInstagramPostArtifact).not.toHaveBeenCalled();
    expect(result.bucket?.errorMessage).toContain(
      "Instagram was not attempted because Shopify product creation failed."
    );
    expect(result.bucket?.status).toBe("FAILED");
  });

  it("publishes with the resolved Instagram credential instead of a stale settings token", async () => {
    const { getBucketById, updateBucket } = await import("@/src/lib/server/buckets");
    const { createShopifyProductArtifact } = await import("@/src/lib/server/adapters/shopify");
    const { publishInstagramPostArtifact } = await import(
      "@/src/lib/server/adapters/instagram"
    );

    let currentBucket = makeBucket("bucket-1");

    vi.mocked(getBucketById).mockImplementation(async () => currentBucket);
    vi.mocked(updateBucket).mockImplementation(async (_bucketId, _userId, updater) => {
      currentBucket = updater(currentBucket);
      return currentBucket;
    });
    vi.mocked(createShopifyProductArtifact).mockResolvedValue({
      shopifyCreated: true,
      shopifyProductId: "gid://shopify/Product/1",
      shopifyProductUrl: "https://demo.myshopify.com/products/flowcart-hat",
      adapterMode: "live",
      errorMessage: "",
      shopifyImageUrl: "https://public.example/hat.jpg",
    });
    vi.mocked(publishInstagramPostArtifact).mockResolvedValue({
      instagramPublished: true,
      instagramPostId: "ig-post-1",
      instagramPostUrl: "https://instagram.com/p/ig-post-1",
      adapterMode: "live",
      errorMessage: "",
    });

    const { launchBucket } = await import("@/src/lib/server/workflows");
    const result = await launchBucket(
      "bucket-1",
      "user-1",
      {
        shopifyStoreDomain: "demo.myshopify.com",
        shopifyAdminToken: "shpca_live",
        instagramAccessToken: "stale-settings-token",
        instagramBusinessAccountId: "stale-business-id",
      },
      resolvedInstagramCredentials
    );

    expect(result.bucket?.status).toBe("DONE");
    expect(publishInstagramPostArtifact).toHaveBeenCalledWith(
      expect.objectContaining({
        instagramCredentials: resolvedInstagramCredentials,
      })
    );
    expect(
      vi.mocked(publishInstagramPostArtifact).mock.calls[0]?.[0]?.instagramCredentials
        ?.publishAccessToken
    ).toBe("resolved-page-token");
  });

  it("preserves Shopify artifacts and fails truthfully when Instagram fails", async () => {
    const { getBucketById, updateBucket } = await import("@/src/lib/server/buckets");
    const { createShopifyProductArtifact } = await import("@/src/lib/server/adapters/shopify");
    const { publishInstagramPostArtifact } = await import(
      "@/src/lib/server/adapters/instagram"
    );

    let currentBucket = makeBucket("bucket-1");

    vi.mocked(getBucketById).mockImplementation(async () => currentBucket);
    vi.mocked(updateBucket).mockImplementation(async (_bucketId, _userId, updater) => {
      currentBucket = updater(currentBucket);
      return currentBucket;
    });
    vi.mocked(createShopifyProductArtifact).mockResolvedValue({
      shopifyCreated: true,
      shopifyProductId: "gid://shopify/Product/1",
      shopifyProductUrl: "https://demo.myshopify.com/products/flowcart-hat",
      adapterMode: "live",
      errorMessage: "",
      shopifyImageUrl: "https://public.example/hat.jpg",
    });
    vi.mocked(publishInstagramPostArtifact).mockResolvedValue({
      instagramPublished: false,
      instagramPostId: "",
      instagramPostUrl: "",
      adapterMode: "live",
      errorMessage: "Instagram publish failed: permissions missing.",
    });

    const { launchBucket } = await import("@/src/lib/server/workflows");
    const result = await launchBucket(
      "bucket-1",
      "user-1",
      {
        shopifyStoreDomain: "demo.myshopify.com",
        shopifyAdminToken: "shpca_live",
        instagramAccessToken: "stale-settings-token",
        instagramBusinessAccountId: "stale-business-id",
      },
      resolvedInstagramCredentials
    );

    expect(result.bucket?.status).toBe("FAILED");
    expect(result.bucket?.shopifyCreated).toBe(true);
    expect(result.bucket?.shopifyProductId).toBe("gid://shopify/Product/1");
    expect(result.bucket?.shopifyProductUrl).toBe(
      "https://demo.myshopify.com/products/flowcart-hat"
    );
    expect(result.bucket?.instagramPublished).toBe(false);
    expect(result.bucket?.errorMessage).toContain("Instagram publish failed: permissions missing.");
  });

  it("only marks DONE when both Shopify and Instagram succeed", async () => {
    const { getBucketById, updateBucket } = await import("@/src/lib/server/buckets");
    const { createShopifyProductArtifact } = await import("@/src/lib/server/adapters/shopify");
    const { publishInstagramPostArtifact } = await import(
      "@/src/lib/server/adapters/instagram"
    );

    let currentBucket = makeBucket("bucket-1");

    vi.mocked(getBucketById).mockImplementation(async () => currentBucket);
    vi.mocked(updateBucket).mockImplementation(async (_bucketId, _userId, updater) => {
      currentBucket = updater(currentBucket);
      return currentBucket;
    });
    vi.mocked(createShopifyProductArtifact).mockResolvedValue({
      shopifyCreated: true,
      shopifyProductId: "gid://shopify/Product/1",
      shopifyProductUrl: "https://demo.myshopify.com/products/flowcart-hat",
      adapterMode: "live",
      errorMessage: "",
      shopifyImageUrl: "https://public.example/hat.jpg",
    });
    vi.mocked(publishInstagramPostArtifact).mockResolvedValue({
      instagramPublished: true,
      instagramPostId: "ig-post-1",
      instagramPostUrl: "https://instagram.com/p/ig-post-1",
      adapterMode: "live",
      errorMessage: "",
    });

    const { launchBucket } = await import("@/src/lib/server/workflows");
    const result = await launchBucket(
      "bucket-1",
      "user-1",
      {
        shopifyStoreDomain: "demo.myshopify.com",
        shopifyAdminToken: "shpca_live",
        instagramAccessToken: "stale-settings-token",
        instagramBusinessAccountId: "stale-business-id",
      },
      resolvedInstagramCredentials
    );

    expect(result.bucket?.status).toBe("DONE");
    expect(result.bucket?.shopifyCreated).toBe(true);
    expect(result.bucket?.instagramPublished).toBe(true);
  });

  it("processes go-all sequentially and counts only final DONE buckets as success", async () => {
    const { getBucketById, getBuckets, updateBucket } = await import("@/src/lib/server/buckets");
    const { createShopifyProductArtifact } = await import("@/src/lib/server/adapters/shopify");
    const { publishInstagramPostArtifact } = await import(
      "@/src/lib/server/adapters/instagram"
    );

    const state = new Map<string, ProductBucket>([
      ["bucket-1", makeBucket("bucket-1")],
      ["bucket-2", makeBucket("bucket-2")],
      ["bucket-3", makeBucket("bucket-3", { status: "FAILED", errorMessage: "old failure" })],
    ]);

    vi.mocked(getBuckets).mockResolvedValue([
      state.get("bucket-1") as ProductBucket,
      state.get("bucket-2") as ProductBucket,
      state.get("bucket-3") as ProductBucket,
    ]);
    vi.mocked(getBucketById).mockImplementation(async (bucketId) => state.get(bucketId) ?? null);
    vi.mocked(updateBucket).mockImplementation(async (bucketId, _userId, updater) => {
      const current = state.get(bucketId);
      if (!current) return null;
      const next = updater(current);
      state.set(bucketId, next);
      return next;
    });
    vi.mocked(createShopifyProductArtifact)
      .mockResolvedValueOnce({
        shopifyCreated: true,
        shopifyProductId: "gid://shopify/Product/1",
        shopifyProductUrl: "https://demo.myshopify.com/products/flowcart-hat-1",
        adapterMode: "live",
        errorMessage: "",
        shopifyImageUrl: "https://public.example/hat-1.jpg",
      })
      .mockResolvedValueOnce({
        shopifyCreated: true,
        shopifyProductId: "gid://shopify/Product/2",
        shopifyProductUrl: "https://demo.myshopify.com/products/flowcart-hat-2",
        adapterMode: "live",
        errorMessage: "",
        shopifyImageUrl: "https://public.example/hat-2.jpg",
      });
    vi.mocked(publishInstagramPostArtifact)
      .mockResolvedValueOnce({
        instagramPublished: true,
        instagramPostId: "ig-post-1",
        instagramPostUrl: "https://instagram.com/p/ig-post-1",
        adapterMode: "live",
        errorMessage: "",
      })
      .mockResolvedValueOnce({
        instagramPublished: false,
        instagramPostId: "",
        instagramPostUrl: "",
        adapterMode: "live",
        errorMessage: "Instagram publish failed: temporary issue.",
      });

    const { goAllSequentially } = await import("@/src/lib/server/workflows");
    const summary = await goAllSequentially(
      "user-1",
      {
        shopifyStoreDomain: "demo.myshopify.com",
        shopifyAdminToken: "shpca_live",
        instagramAccessToken: "stale-settings-token",
        instagramBusinessAccountId: "stale-business-id",
      },
      resolvedInstagramCredentials
    );

    expect(summary).toEqual({
      total: 2,
      succeeded: 1,
      failed: 1,
      bucketIds: ["bucket-1", "bucket-2"],
    });
    expect(state.get("bucket-1")?.status).toBe("DONE");
    expect(state.get("bucket-2")?.status).toBe("FAILED");
    expect(vi.mocked(createShopifyProductArtifact)).toHaveBeenCalledTimes(2);
    expect(vi.mocked(publishInstagramPostArtifact)).toHaveBeenCalledTimes(2);
    expect(
      vi.mocked(publishInstagramPostArtifact).mock.invocationCallOrder[0]
    ).toBeLessThan(vi.mocked(createShopifyProductArtifact).mock.invocationCallOrder[1]);
  });

  it("syncs done buckets by updating the same Shopify product id without launching a new product", async () => {
    const { getBucketById, updateBucket } = await import("@/src/lib/server/buckets");
    const { createShopifyProductArtifact, updateShopifyProductArtifact } = await import(
      "@/src/lib/server/adapters/shopify"
    );
    const { publishInstagramPostArtifact, updateInstagramPostArtifact } = await import(
      "@/src/lib/server/adapters/instagram"
    );

    let currentBucket = makeBucket("bucket-1", {
      status: "DONE",
      shopifyCreated: true,
      shopifyProductId: "gid://shopify/Product/42",
      shopifyProductUrl: "https://demo.myshopify.com/products/flowcart-hat",
      instagramPublished: true,
      instagramPostId: "ig-post-1",
      instagramPostUrl: "https://instagram.com/p/ig-post-1",
    });

    vi.mocked(getBucketById).mockImplementation(async () => currentBucket);
    vi.mocked(updateBucket).mockImplementation(async (_bucketId, _userId, updater) => {
      currentBucket = updater(currentBucket);
      return currentBucket;
    });
    vi.mocked(updateShopifyProductArtifact).mockResolvedValue({
      shopifyCreated: true,
      shopifyProductId: "gid://shopify/Product/42",
      shopifyProductUrl: "https://demo.myshopify.com/products/flowcart-hat",
      adapterMode: "live",
      errorMessage: "",
      shopifyImageUrl: "https://cdn.example/hat.jpg",
    });
    vi.mocked(updateInstagramPostArtifact).mockResolvedValue({
      instagramUpdated: false,
      instagramPostId: "ig-post-1",
      instagramPostUrl: "https://instagram.com/p/ig-post-1",
      outcome: "unchanged",
      reason: "unsupported_edit_path",
      errorMessage: "Published post can't be edited in place for this media type.",
      mediaType: "CAROUSEL_ALBUM",
      mediaProductType: "FEED",
    });

    const { syncDoneBucket } = await import("@/src/lib/server/workflows");
    const result = await syncDoneBucket(
      "bucket-1",
      "user-1",
      {
        titleRaw: "FlowCart Hat Updated",
        price: 55.0,
      },
      {
        shopifyStoreDomain: "demo.myshopify.com",
        shopifyAdminToken: "shpca_live",
        instagramAccessToken: "stale-settings-token",
        instagramBusinessAccountId: "stale-business-id",
      },
      resolvedInstagramCredentials
    );

    expect(result.notFound).toBe(false);
    expect(result.result?.shopifyProductId).toBe("gid://shopify/Product/42");
    expect(result.result?.shopify.productFieldsUpdated).toBe(true);
    expect(result.result?.bucket.shopifyProductId).toBe("gid://shopify/Product/42");
    expect(result.result?.bucket.instagramPostId).toBe("ig-post-1");
    expect(result.result?.instagram.outcome).toBe("unchanged");
    expect(result.result?.instagram.reason).toBe("unsupported_edit_path");
    expect(result.result?.chips).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "Shopify updated", tone: "success" }),
        expect.objectContaining({ label: "Instagram unchanged", tone: "warning" }),
      ])
    );
    expect(updateShopifyProductArtifact).toHaveBeenCalledWith(
      expect.objectContaining({
        existingProductId: "gid://shopify/Product/42",
      })
    );
    expect(updateInstagramPostArtifact).toHaveBeenCalledWith(
      expect.objectContaining({
        instagramPostId: "ig-post-1",
      })
    );
    expect(createShopifyProductArtifact).not.toHaveBeenCalled();
    expect(publishInstagramPostArtifact).not.toHaveBeenCalled();
  });

  it("keeps quantity stable when only price is edited during done-bucket sync", async () => {
    const { getBucketById, updateBucket } = await import("@/src/lib/server/buckets");
    const { createShopifyProductArtifact, updateShopifyProductArtifact } = await import(
      "@/src/lib/server/adapters/shopify"
    );
    const { publishInstagramPostArtifact, updateInstagramPostArtifact } = await import(
      "@/src/lib/server/adapters/instagram"
    );

    let currentBucket = makeBucket("bucket-qty-price", {
      status: "DONE",
      quantity: 1000,
      price: 1100,
      shopifyCreated: true,
      shopifyProductId: "gid://shopify/Product/99",
      shopifyProductUrl: "https://demo.myshopify.com/products/flowcart-hat",
      instagramPublished: true,
      instagramPostId: "ig-post-qty-price",
      instagramPostUrl: "https://instagram.com/p/ig-post-qty-price",
    });

    vi.mocked(getBucketById).mockImplementation(async () => currentBucket);
    vi.mocked(updateBucket).mockImplementation(async (_bucketId, _userId, updater) => {
      currentBucket = updater(currentBucket);
      return currentBucket;
    });
    vi.mocked(updateShopifyProductArtifact).mockResolvedValue({
      shopifyCreated: true,
      shopifyProductId: "gid://shopify/Product/99",
      shopifyProductUrl: "https://demo.myshopify.com/products/flowcart-hat",
      adapterMode: "live",
      errorMessage: "",
      warningMessage:
        "Inventory quantity was not updated because this Shopify connection cannot access inventory locations.",
      productFieldsUpdated: true,
      inventoryQuantityUpdated: false,
      inventoryQuantityBlockedByPermissions: true,
      inventoryWarningCode: "permissions",
      inventoryWarningMessage:
        "Inventory quantity was not updated because this Shopify connection cannot access inventory locations.",
    });
    vi.mocked(updateInstagramPostArtifact).mockResolvedValue({
      instagramUpdated: true,
      instagramPostId: "ig-post-qty-price",
      instagramPostUrl: "https://instagram.com/p/ig-post-qty-price",
      outcome: "updated",
      reason: "updated_in_place",
      errorMessage: "",
      mediaType: "IMAGE",
      mediaProductType: "FEED",
    });

    const { syncDoneBucket } = await import("@/src/lib/server/workflows");
    const result = await syncDoneBucket(
      "bucket-qty-price",
      "user-1",
      {
        price: 11000,
      },
      {
        shopifyStoreDomain: "demo.myshopify.com",
        shopifyAdminToken: "shpca_live",
        instagramAccessToken: "stale-settings-token",
        instagramBusinessAccountId: "stale-business-id",
      },
      resolvedInstagramCredentials
    );

    expect(result.notFound).toBe(false);
    expect(result.result?.bucket.price).toBe(11000);
    expect(result.result?.bucket.quantity).toBe(1000);
    expect(result.result?.bucket.shopifyProductId).toBe("gid://shopify/Product/99");
    expect(result.result?.bucket.instagramPostId).toBe("ig-post-qty-price");
    expect(result.result?.shopify.productFieldsUpdated).toBe(true);
    expect(result.result?.shopify.inventoryQuantityUpdated).toBe(false);
    expect(result.result?.shopify.inventoryQuantityBlockedByPermissions).toBe(true);
    expect(result.result?.shopify.inventoryWarning).toContain(
      "cannot access inventory locations"
    );
    expect(result.result?.shopify.inventoryReconnectRequired).toBe(true);
    expect(result.result?.chips).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "Shopify updated", tone: "success" }),
        expect.objectContaining({ label: "Inventory unchanged", tone: "warning" }),
        expect.objectContaining({ label: "Reconnect Shopify", tone: "warning" }),
        expect.objectContaining({ label: "Instagram updated", tone: "success" }),
      ])
    );
    expect(updateShopifyProductArtifact).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          price: 11000,
          quantity: 1000,
        }),
      })
    );
    expect(updateInstagramPostArtifact).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          price: 11000,
          quantity: 1000,
        }),
      })
    );
    expect(createShopifyProductArtifact).not.toHaveBeenCalled();
    expect(publishInstagramPostArtifact).not.toHaveBeenCalled();
  });

  it("keeps price stable when only quantity is edited during done-bucket sync", async () => {
    const { getBucketById, updateBucket } = await import("@/src/lib/server/buckets");
    const { createShopifyProductArtifact, updateShopifyProductArtifact } = await import(
      "@/src/lib/server/adapters/shopify"
    );
    const { publishInstagramPostArtifact, updateInstagramPostArtifact } = await import(
      "@/src/lib/server/adapters/instagram"
    );

    let currentBucket = makeBucket("bucket-price-qty", {
      status: "DONE",
      quantity: 4,
      price: 199.99,
      shopifyCreated: true,
      shopifyProductId: "gid://shopify/Product/100",
      shopifyProductUrl: "https://demo.myshopify.com/products/flowcart-hat",
      instagramPublished: true,
      instagramPostId: "ig-post-price-qty",
      instagramPostUrl: "https://instagram.com/p/ig-post-price-qty",
    });

    vi.mocked(getBucketById).mockImplementation(async () => currentBucket);
    vi.mocked(updateBucket).mockImplementation(async (_bucketId, _userId, updater) => {
      currentBucket = updater(currentBucket);
      return currentBucket;
    });
    vi.mocked(updateShopifyProductArtifact).mockResolvedValue({
      shopifyCreated: true,
      shopifyProductId: "gid://shopify/Product/100",
      shopifyProductUrl: "https://demo.myshopify.com/products/flowcart-hat",
      adapterMode: "live",
      errorMessage: "",
      productFieldsUpdated: true,
      inventoryQuantityUpdated: true,
      inventoryQuantityBlockedByPermissions: false,
    });
    vi.mocked(updateInstagramPostArtifact).mockResolvedValue({
      instagramUpdated: true,
      instagramPostId: "ig-post-price-qty",
      instagramPostUrl: "https://instagram.com/p/ig-post-price-qty",
      outcome: "updated",
      reason: "updated_in_place",
      errorMessage: "",
      mediaType: "IMAGE",
      mediaProductType: "FEED",
    });

    const { syncDoneBucket } = await import("@/src/lib/server/workflows");
    const result = await syncDoneBucket(
      "bucket-price-qty",
      "user-1",
      {
        quantity: 25,
      },
      {
        shopifyStoreDomain: "demo.myshopify.com",
        shopifyAdminToken: "shpca_live",
        instagramAccessToken: "stale-settings-token",
        instagramBusinessAccountId: "stale-business-id",
      },
      resolvedInstagramCredentials
    );

    expect(result.notFound).toBe(false);
    expect(result.result?.bucket.quantity).toBe(25);
    expect(result.result?.bucket.price).toBe(199.99);
    expect(result.result?.shopify.inventoryWarning).toBe("");
    expect(result.result?.shopify.inventoryReconnectRequired).toBe(false);
    expect(updateShopifyProductArtifact).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          quantity: 25,
          price: 199.99,
        }),
      })
    );
    expect(updateInstagramPostArtifact).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          quantity: 25,
          price: 199.99,
        }),
      })
    );
    expect(createShopifyProductArtifact).not.toHaveBeenCalled();
    expect(publishInstagramPostArtifact).not.toHaveBeenCalled();
  });
});
