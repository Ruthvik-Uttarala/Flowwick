import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/src/lib/server/shopify", () => ({
  fetchShopifyAdminGraphQL: vi.fn(),
}));

describe("shopify adapter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fails with a clean authorization message when the DB-backed token is missing", async () => {
    const { fetchShopifyAdminGraphQL } = await import("@/src/lib/server/shopify");
    const { createShopifyProductArtifact } = await import("@/src/lib/server/adapters/shopify");
    const result = await createShopifyProductArtifact({
      payload: {
        storeDomain: "demo.myshopify.com",
        shopifyAdminToken: "",
        instagramAccessToken: "ig-token",
        instagramBusinessAccountId: "1789",
        title: "FlowCart Hat",
        description: "Warm wool hat",
        price: 49.99,
        quantity: 8,
        imageUrls: ["https://public.example/hat.jpg"],
      },
      settings: {
        shopifyStoreDomain: "demo.myshopify.com",
        shopifyAdminToken: "",
        instagramAccessToken: "ig-token",
        instagramBusinessAccountId: "1789",
      },
    });

    expect(result.shopifyCreated).toBe(false);
    expect(result.errorMessage).toBe("Shopify authorization is required before launch.");
    expect(fetchShopifyAdminGraphQL).not.toHaveBeenCalled();
  });

  it("builds the expected GraphQL flow and returns the live product URL", async () => {
    const { fetchShopifyAdminGraphQL } = await import("@/src/lib/server/shopify");
    vi.mocked(fetchShopifyAdminGraphQL)
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
    expect(fetchShopifyAdminGraphQL).toHaveBeenCalledTimes(4);
    for (const [request] of vi.mocked(fetchShopifyAdminGraphQL).mock.calls) {
      expect(request.query).not.toContain("locations(");
    }
    expect(fetchShopifyAdminGraphQL).toHaveBeenNthCalledWith(
      1,
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
            variants: [
              expect.not.objectContaining({
                inventoryPolicy: expect.anything(),
                inventoryQuantities: expect.anything(),
              }),
            ],
          }),
        }),
      })
    );
    const createCall = vi.mocked(fetchShopifyAdminGraphQL).mock.calls[0]?.[0];
    const serializedVariables = JSON.stringify(createCall?.variables ?? {});
    expect(createCall?.variables).not.toHaveProperty("input.variants.0.inventoryPolicy");
    expect(createCall?.variables).not.toHaveProperty("input.variants.0.inventoryQuantities");
    expect(serializedVariables).not.toContain("inventoryPolicy");
    expect(serializedVariables).not.toContain("inventoryQuantities");
  });

  it("normalizes Shopify userErrors into a single failure message", async () => {
    const { fetchShopifyAdminGraphQL } = await import("@/src/lib/server/shopify");
    vi.mocked(fetchShopifyAdminGraphQL)
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
    expect(fetchShopifyAdminGraphQL).toHaveBeenCalledTimes(1);
    const firstCall = vi.mocked(fetchShopifyAdminGraphQL).mock.calls[0]?.[0];
    expect(firstCall?.query).not.toContain("locations(");
    const serializedVariables = JSON.stringify(firstCall?.variables ?? {});
    expect(serializedVariables).not.toContain("inventoryPolicy");
    expect(serializedVariables).not.toContain("inventoryQuantities");
  });

  it("updates an existing Shopify product id in-place instead of creating a new product", async () => {
    const { fetchShopifyAdminGraphQL } = await import("@/src/lib/server/shopify");
    vi.mocked(fetchShopifyAdminGraphQL)
      .mockResolvedValueOnce({
        product: {
          id: "gid://shopify/Product/42",
          handle: "flowcart-hat",
          onlineStoreUrl: "https://demo.myshopify.com/products/flowcart-hat",
          media: { nodes: [{ image: { url: "https://cdn.example/image.jpg" } }] },
          variants: {
            nodes: [
              {
                id: "gid://shopify/ProductVariant/99",
                inventoryItem: { id: "gid://shopify/InventoryItem/11" },
              },
            ],
          },
        },
      })
      .mockResolvedValueOnce({
        productUpdate: {
          product: { id: "gid://shopify/Product/42" },
          userErrors: [],
        },
      })
      .mockResolvedValueOnce({
        productVariantsBulkUpdate: { userErrors: [] },
      })
      .mockResolvedValueOnce({
        locations: { nodes: [{ id: "gid://shopify/Location/1" }] },
      })
      .mockResolvedValueOnce({
        inventorySetQuantities: { userErrors: [] },
      })
      .mockResolvedValueOnce({
        productSet: { product: { id: "gid://shopify/Product/42" }, userErrors: [] },
      })
      .mockResolvedValueOnce({
        product: {
          id: "gid://shopify/Product/42",
          handle: "flowcart-hat",
          onlineStoreUrl: "https://demo.myshopify.com/products/flowcart-hat",
          media: { nodes: [{ image: { url: "https://cdn.example/image-updated.jpg" } }] },
        },
      });

    const { updateShopifyProductArtifact } = await import("@/src/lib/server/adapters/shopify");
    const result = await updateShopifyProductArtifact({
      payload: {
        storeDomain: "demo.myshopify.com",
        shopifyAdminToken: "shpca_live",
        instagramAccessToken: "ig-token",
        instagramBusinessAccountId: "1789",
        title: "FlowCart Hat Updated",
        description: "Warm wool hat, updated",
        price: 59.99,
        quantity: 12,
        imageUrls: ["https://public.example/hat-updated.jpg"],
      },
      settings: {
        shopifyStoreDomain: "demo.myshopify.com",
        shopifyAdminToken: "shpca_live",
        instagramAccessToken: "ig-token",
        instagramBusinessAccountId: "1789",
      },
      existingProductId: "gid://shopify/Product/42",
    });

    expect(result.shopifyCreated).toBe(true);
    expect(result.shopifyProductId).toBe("gid://shopify/Product/42");
    expect(result.shopifyProductUrl).toBe("https://demo.myshopify.com/products/flowcart-hat");
    expect(fetchShopifyAdminGraphQL).toHaveBeenCalled();
    expect(fetchShopifyAdminGraphQL).not.toHaveBeenCalledWith(
      expect.objectContaining({
        query: expect.stringContaining("CreateFlowCartProduct"),
        variables: expect.objectContaining({
          input: expect.objectContaining({
            title: "FlowCart Hat Updated",
          }),
        }),
      })
    );
  });

  it("keeps in-place product updates successful when locations inventory access is denied", async () => {
    const { fetchShopifyAdminGraphQL } = await import("@/src/lib/server/shopify");
    vi.mocked(fetchShopifyAdminGraphQL)
      .mockResolvedValueOnce({
        product: {
          id: "gid://shopify/Product/42",
          handle: "flowcart-hat",
          onlineStoreUrl: "https://demo.myshopify.com/products/flowcart-hat",
          media: { nodes: [{ image: { url: "https://cdn.example/image.jpg" } }] },
          variants: {
            nodes: [
              {
                id: "gid://shopify/ProductVariant/99",
                inventoryItem: { id: "gid://shopify/InventoryItem/11" },
              },
            ],
          },
        },
      })
      .mockResolvedValueOnce({
        productUpdate: {
          product: { id: "gid://shopify/Product/42" },
          userErrors: [],
        },
      })
      .mockResolvedValueOnce({
        productVariantsBulkUpdate: { userErrors: [] },
      })
      .mockRejectedValueOnce(new Error("Access denied for locations field."))
      .mockResolvedValueOnce({
        product: {
          id: "gid://shopify/Product/42",
          handle: "flowcart-hat",
          onlineStoreUrl: "https://demo.myshopify.com/products/flowcart-hat",
          media: { nodes: [{ image: { url: "https://cdn.example/image-updated.jpg" } }] },
        },
      });

    const { updateShopifyProductArtifact } = await import("@/src/lib/server/adapters/shopify");
    const result = await updateShopifyProductArtifact({
      payload: {
        storeDomain: "demo.myshopify.com",
        shopifyAdminToken: "shpca_live",
        instagramAccessToken: "ig-token",
        instagramBusinessAccountId: "1789",
        title: "FlowCart Hat Updated",
        description: "Warm wool hat, updated",
        price: 59.99,
        quantity: 12,
        imageUrls: [],
      },
      settings: {
        shopifyStoreDomain: "demo.myshopify.com",
        shopifyAdminToken: "shpca_live",
        instagramAccessToken: "ig-token",
        instagramBusinessAccountId: "1789",
      },
      existingProductId: "gid://shopify/Product/42",
    });

    expect(result.shopifyCreated).toBe(true);
    expect(result.shopifyProductId).toBe("gid://shopify/Product/42");
    expect(result.shopifyProductUrl).toBe("https://demo.myshopify.com/products/flowcart-hat");
    expect(result.warningMessage).toContain("Inventory quantity was not updated");
    expect(result.warningMessage).toContain("Access denied for locations field");
  });
});
