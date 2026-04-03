import { beforeEach, describe, expect, it, vi } from "vitest";

describe("instagram adapter", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.stubEnv("INSTAGRAM_ENABLED", "true");
  });

  it("rejects missing public image URLs", async () => {
    const { publishInstagramPostArtifact } = await import("@/src/lib/server/adapters/instagram");
    const result = await publishInstagramPostArtifact({
      payload: {
        storeDomain: "demo.myshopify.com",
        shopifyAdminToken: "shpca_live",
        instagramAccessToken: "ig-token",
        instagramBusinessAccountId: "1789",
        title: "FlowCart Hat",
        description: "Warm wool hat",
        price: 49.99,
        quantity: 8,
        imageUrls: ["/uploads/internal-only.jpg"],
      },
      settings: {
        shopifyStoreDomain: "demo.myshopify.com",
        shopifyAdminToken: "shpca_live",
        instagramAccessToken: "ig-token",
        instagramBusinessAccountId: "1789",
      },
      shopifyProductUrl: "https://demo.myshopify.com/products/flowcart-hat",
    });

    expect(result.instagramPublished).toBe(false);
    expect(result.errorMessage).toContain("public image URL");
  });

  it("builds the publish caption with product details and shop URL", async () => {
    const fetchMock = vi
      .spyOn(global, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: "creation-1" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: "media-1" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ permalink: "https://instagram.com/p/media-1/" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      );

    const { publishInstagramPostArtifact } = await import("@/src/lib/server/adapters/instagram");
    const result = await publishInstagramPostArtifact({
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
        shopifyStoreDomain: "demo.myshopify.com",
        shopifyAdminToken: "shpca_live",
        instagramAccessToken: "ig-token",
        instagramBusinessAccountId: "1789",
      },
      shopifyProductUrl: "https://demo.myshopify.com/products/flowcart-hat",
    });

    const firstRequestBody = fetchMock.mock.calls[0]?.[1]?.body;
    expect(String(firstRequestBody)).toContain("caption=FlowCart+Hat");
    expect(String(firstRequestBody)).toContain("Price%3A+%2449.99");
    expect(String(firstRequestBody)).toContain("Quantity%3A+8");
    expect(String(firstRequestBody)).toContain(
      encodeURIComponent("https://demo.myshopify.com/products/flowcart-hat")
    );
    expect(result).toMatchObject({
      instagramPublished: true,
      instagramPostId: "media-1",
      instagramPostUrl: "https://instagram.com/p/media-1/",
    });
  });
});
