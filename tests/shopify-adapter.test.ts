import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/src/lib/server/shopify", () => ({
  fetchShopifyAdminGraphQL: vi.fn(),
}));

describe("shopify adapter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("builds the expected GraphQL flow and returns the live product URL", async () => {
    const { fetchShopifyAdminGraphQL } = await import("@/src/lib/server/shopify");
    vi.mocked(fetchShopifyAdminGraphQL)
      .mockResolvedValueOnce({
        locations: { nodes: [{ id: "gid://shopify/Location/1", name: "Primary" }] },
      })
      .mockResolvedValueOnce({
        productSet: {
          product: { id: "gid://shopify/Product/1" },
          userErrors: [],
        },
      })
      .mockResolvedValueOnce({
        publications: {
          nodes: [
            {
              id: "gid://shopify/Publication/1",
              name: "Online Store",
              channels: { nodes: [{ name: "Online Store", handle: "online-store" }] },
            },
          ],
        },
      })
      .mockResolvedValueOnce({
        publishablePublish: { userErrors: [] },
      })
      .mockResolvedValueOnce({
        product: {
          id: "gid://shopify/Product/1",
          handle: "flowcart-hat",
          onlineStoreUrl: "https://demo.myshopify.com/products/flowcart-hat",
          media: { nodes: [{ image: { url: "https://cdn.example/image.jpg" } }] },
        },
      });

    const { createShopifyProductArtifact } = await import("@/src/lib/server/adapters/shopify");
    const result = await createShopifyProductArtifact({
      payload: {
        storeDomain: "demo.myshopify.com",
        shopifyAdminToken: "shpca_live",
        instagramAccessToken: "ig-token",
        instagramBusinessAccountId: "1789",
        title: "FlowCart Hat",
        description: "Warm wool hat",
        price: 49.99,
        quantity: 8,
        imageUrls: ["https://public.example/hat.jpg"],
      },
      settings: {
        shopifyStoreDomain: "demo",
        shopifyAdminToken: "shpca_live",
        instagramAccessToken: "ig-token",
        instagramBusinessAccountId: "1789",
      },
    });

    expect(result).toMatchObject({
      shopifyCreated: true,
      shopifyProductId: "gid://shopify/Product/1",
      shopifyProductUrl: "https://demo.myshopify.com/products/flowcart-hat",
      shopifyImageUrl: "https://cdn.example/image.jpg",
    });
    expect(fetchShopifyAdminGraphQL).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        shopDomain: "demo.myshopify.com",
        adminToken: "shpca_live",
        query: expect.stringContaining("productSet"),
        variables: expect.objectContaining({
          input: expect.objectContaining({
            title: "FlowCart Hat",
            files: [
              expect.objectContaining({
                originalSource: "https://public.example/hat.jpg",
              }),
            ],
          }),
        }),
      })
    );
  });

  it("normalizes Shopify userErrors into a single failure message", async () => {
    const { fetchShopifyAdminGraphQL } = await import("@/src/lib/server/shopify");
    vi.mocked(fetchShopifyAdminGraphQL)
      .mockResolvedValueOnce({
        locations: { nodes: [{ id: "gid://shopify/Location/1", name: "Primary" }] },
      })
      .mockResolvedValueOnce({
        productSet: {
          product: null,
          userErrors: [{ field: ["input", "variants", "0", "price"], message: "Price is invalid" }],
        },
      });

    const { createShopifyProductArtifact } = await import("@/src/lib/server/adapters/shopify");
    const result = await createShopifyProductArtifact({
      payload: {
        storeDomain: "demo.myshopify.com",
        shopifyAdminToken: "shpca_live",
        instagramAccessToken: "",
        instagramBusinessAccountId: "",
        title: "FlowCart Hat",
        description: "Warm wool hat",
        price: 49.99,
        quantity: 8,
        imageUrls: ["https://public.example/hat.jpg"],
      },
      settings: {
        shopifyStoreDomain: "demo.myshopify.com",
        shopifyAdminToken: "shpca_live",
        instagramAccessToken: "",
        instagramBusinessAccountId: "",
      },
    });

    expect(result.shopifyCreated).toBe(false);
    expect(result.errorMessage).toContain("input.variants.0.price: Price is invalid");
  });
});
