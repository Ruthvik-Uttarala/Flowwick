import { beforeEach, describe, expect, it, vi } from "vitest";

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
});
