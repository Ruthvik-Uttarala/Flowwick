import { describe, expect, it } from "vitest";
import type { ProductBucket } from "@/src/lib/types";
import { applyBucketPatch } from "@/src/lib/server/buckets";

function makeBucket(overrides: Partial<ProductBucket> = {}): ProductBucket {
  const now = "2026-04-20T10:00:00.000Z";
  return {
    id: "bucket-1",
    titleRaw: "FlowCart Hat",
    descriptionRaw: "Warm wool hat",
    titleEnhanced: "FlowCart Hat",
    descriptionEnhanced: "Warm wool hat",
    quantity: 3,
    price: 49.99,
    imageUrls: ["https://cdn.example/hat.jpg"],
    status: "DONE",
    shopifyCreated: true,
    shopifyProductId: "gid://shopify/Product/1",
    shopifyProductUrl: "https://demo.myshopify.com/products/flowcart-hat",
    instagramPublished: true,
    instagramPostId: "ig-post-1",
    instagramPostUrl: "https://instagram.com/p/ig-post-1",
    errorMessage: "",
    trashedAt: "",
    deleteAfterAt: "",
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe("bucket patch safety", () => {
  it("keeps launched artifact ids when patching a done bucket", () => {
    const patched = applyBucketPatch(makeBucket(), {
      titleRaw: "FlowCart Hat v2",
      price: 59.99,
    });

    expect(patched.status).toBe("DONE");
    expect(patched.shopifyProductId).toBe("gid://shopify/Product/1");
    expect(patched.shopifyProductUrl).toBe(
      "https://demo.myshopify.com/products/flowcart-hat"
    );
    expect(patched.instagramPostId).toBe("ig-post-1");
    expect(patched.instagramPostUrl).toBe("https://instagram.com/p/ig-post-1");
  });

  it("clears launched artifacts when patching non-done buckets", () => {
    const patched = applyBucketPatch(
      makeBucket({
        status: "FAILED",
        shopifyCreated: true,
        shopifyProductId: "gid://shopify/Product/1",
        instagramPublished: false,
        instagramPostId: "",
      }),
      { titleRaw: "Retry title" }
    );

    expect(patched.shopifyCreated).toBe(false);
    expect(patched.shopifyProductId).toBe("");
    expect(patched.instagramPublished).toBe(false);
    expect(patched.instagramPostId).toBe("");
  });
});
