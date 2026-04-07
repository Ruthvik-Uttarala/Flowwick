import { beforeEach, describe, expect, it, vi } from "vitest";
import { ActiveInstagramCredentials } from "@/src/lib/types";

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

describe("launch workflow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("skips Instagram when Shopify product creation fails", async () => {
    const { getBucketById, updateBucket } = await import("@/src/lib/server/buckets");
    const { createShopifyProductArtifact } = await import("@/src/lib/server/adapters/shopify");
    const { publishInstagramPostArtifact } = await import(
      "@/src/lib/server/adapters/instagram"
    );

    const bucket = {
      id: "bucket-1",
      titleRaw: "FlowCart Hat",
      descriptionRaw: "Warm wool hat",
      titleEnhanced: "",
      descriptionEnhanced: "",
      quantity: 8,
      price: 49.99,
      imageUrls: ["https://public.example/hat.jpg"],
      status: "READY" as const,
      shopifyCreated: false,
      shopifyProductId: "",
      shopifyProductUrl: "",
      instagramPublished: false,
      instagramPostId: "",
      instagramPostUrl: "",
      errorMessage: "",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    vi.mocked(getBucketById).mockResolvedValue(bucket);
    vi.mocked(updateBucket).mockImplementation(async (_bucketId, _userId, updater) =>
      updater(bucket)
    );
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

    const bucket = {
      id: "bucket-1",
      titleRaw: "FlowCart Hat",
      descriptionRaw: "Warm wool hat",
      titleEnhanced: "",
      descriptionEnhanced: "",
      quantity: 8,
      price: 49.99,
      imageUrls: ["https://public.example/hat.jpg"],
      status: "READY" as const,
      shopifyCreated: false,
      shopifyProductId: "",
      shopifyProductUrl: "",
      instagramPublished: false,
      instagramPostId: "",
      instagramPostUrl: "",
      errorMessage: "",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const resolvedInstagramCredentials: ActiveInstagramCredentials = {
      status: "connected",
      source: "oauth_cached_page_token",
      pageId: "page-1",
      pageName: "FlowCart Page",
      instagramBusinessAccountId: "ig-business-1",
      publishAccessToken: "resolved-page-token",
      hasLongLivedUserToken: true,
    };

    vi.mocked(getBucketById).mockResolvedValue(bucket);
    vi.mocked(updateBucket).mockImplementation(async (_bucketId, _userId, updater) =>
      updater(bucket)
    );
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
});
