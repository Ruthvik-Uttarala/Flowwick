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
}));

vi.mock("@/src/lib/server/adapters/instagram", () => ({
  publishInstagramPostArtifact: vi.fn(),
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
});
