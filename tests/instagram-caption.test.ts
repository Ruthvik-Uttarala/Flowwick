import { describe, expect, it } from "vitest";
import {
  buildInstagramCaption,
  INSTAGRAM_CAPTION_MAX_LENGTH,
  isValidInstagramPublishImageUrl,
  selectInstagramCarouselImageUrls,
  selectInstagramImageUrl,
} from "@/src/lib/server/instagram-publish";
import { LaunchPayload } from "@/src/lib/types";

function makePayload(overrides: Partial<LaunchPayload> = {}): LaunchPayload {
  return {
    storeDomain: "demo.myshopify.com",
    shopifyAdminToken: "shpca_live",
    instagramAccessToken: "legacy-token",
    instagramBusinessAccountId: "1789",
    title: "FlowCart Hat",
    description: "Warm wool hat for cold mornings.",
    price: 49.99,
    quantity: 8,
    imageUrls: ["https://cdn.supabase.example/storage/v1/object/public/product_images/hat.jpg"],
    ...overrides,
  };
}

describe("instagram publish helpers", () => {
  it("sanitizes caption fragments and keeps readable grammar", () => {
    const caption = buildInstagramCaption(
      makePayload({
        title: " <strong>FlowCart&nbsp;Hat</strong>!!! ",
        description:
          "<p>Warm &amp; cozy <em>wool</em> hat.&nbsp;&nbsp;Perfect for travel!!</p><p>null</p>",
      }),
      "https://demo.myshopify.com/products/flowcart-hat"
    );

    expect(caption).toContain("FlowCart Hat!");
    expect(caption).toContain("Warm & cozy wool hat. Perfect for travel!");
    expect(caption).toContain("Price: $49.99");
    expect(caption).toContain("Quantity: 8");
    expect(caption).toContain("Shop now: https://demo.myshopify.com/products/flowcart-hat");
    expect(caption).not.toContain("<strong>");
    expect(caption).not.toContain("&nbsp;");
    expect(caption).not.toContain("null");
  });

  it("drops junk values and invalid metadata fragments", () => {
    const caption = buildInstagramCaption(
      makePayload({
        title: "undefined",
        description: "<p>[object Object]</p>",
        price: Number.NaN,
        quantity: 0,
      }),
      "http://demo.myshopify.com/products/flowcart-hat"
    );

    expect(caption).toBe("");
  });

  it("truncates by shrinking description first while preserving title and key lines", () => {
    const longDescription = "Cozy hat ".repeat(500);
    const caption = buildInstagramCaption(
      makePayload({
        title: "FlowCart Winter Hat",
        description: longDescription,
      }),
      "https://demo.myshopify.com/products/flowcart-hat"
    );

    expect(caption.length).toBeLessThanOrEqual(INSTAGRAM_CAPTION_MAX_LENGTH);
    expect(caption).toContain("FlowCart Winter Hat");
    expect(caption).toContain("Price: $49.99");
    expect(caption).toContain("Quantity: 8");
    expect(caption).toContain("Shop now: https://demo.myshopify.com/products/flowcart-hat");
  });

  it("only includes the shop url when it is absolute https", () => {
    const caption = buildInstagramCaption(
      makePayload(),
      "http://demo.myshopify.com/products/flowcart-hat"
    );

    expect(caption).not.toContain("Shop now:");
  });

  it("accepts only production-safe publishable image urls", () => {
    expect(
      isValidInstagramPublishImageUrl(
        "https://cdn.supabase.example/storage/v1/object/public/product_images/hat.jpg"
      )
    ).toBe(true);
    expect(isValidInstagramPublishImageUrl("http://public.example/hat.jpg")).toBe(false);
    expect(isValidInstagramPublishImageUrl("/uploads/hat.jpg")).toBe(false);
    expect(isValidInstagramPublishImageUrl("data:image/png;base64,abc")).toBe(false);
    expect(isValidInstagramPublishImageUrl("blob:https://public.example/123")).toBe(false);
    expect(isValidInstagramPublishImageUrl("https://localhost:3000/hat.jpg")).toBe(false);
    expect(isValidInstagramPublishImageUrl("https://127.0.0.1/hat.jpg")).toBe(false);
    expect(isValidInstagramPublishImageUrl("https://10.0.0.4/hat.jpg")).toBe(false);
    expect(isValidInstagramPublishImageUrl("https://192.168.1.20/hat.jpg")).toBe(false);
    expect(
      isValidInstagramPublishImageUrl(
        "https://flowcart-git-main-ruthvikuttarala-5083s-projects.vercel.app/hat.jpg"
      )
    ).toBe(false);
    expect(isValidInstagramPublishImageUrl("https://public.example/hat.svg")).toBe(false);
    expect(isValidInstagramPublishImageUrl("https://public.example/hat.gif")).toBe(false);
  });

  it("prefers a valid shopify image url and falls back to the first valid bucket image", () => {
    const payload = makePayload({
      imageUrls: [
        "https://localhost:3000/hat.jpg",
        "https://cdn.supabase.example/storage/v1/object/public/product_images/fallback.jpg",
      ],
    });

    expect(
      selectInstagramImageUrl(payload, "https://cdn.shopify.com/s/files/1/hat.png")
    ).toEqual({
      imageUrl: "https://cdn.shopify.com/s/files/1/hat.png",
      source: "shopify",
    });

    expect(selectInstagramImageUrl(payload, "http://cdn.shopify.com/s/files/1/hat.png")).toEqual({
      imageUrl: "https://cdn.supabase.example/storage/v1/object/public/product_images/fallback.jpg",
      source: "bucket",
    });
  });

  it("selects up to ten valid bucket images in stored order for carousels", () => {
    const payload = makePayload({
      imageUrls: [
        "https://localhost:3000/not-public.jpg",
        "https://cdn.supabase.example/storage/v1/object/public/product_images/1.jpg",
        "https://cdn.supabase.example/storage/v1/object/public/product_images/2.jpg",
        "https://cdn.supabase.example/storage/v1/object/public/product_images/3.jpg",
        "https://cdn.supabase.example/storage/v1/object/public/product_images/4.jpg",
        "https://cdn.supabase.example/storage/v1/object/public/product_images/5.jpg",
        "https://cdn.supabase.example/storage/v1/object/public/product_images/6.jpg",
        "https://cdn.supabase.example/storage/v1/object/public/product_images/7.jpg",
        "https://cdn.supabase.example/storage/v1/object/public/product_images/8.jpg",
        "https://cdn.supabase.example/storage/v1/object/public/product_images/9.jpg",
        "https://cdn.supabase.example/storage/v1/object/public/product_images/10.jpg",
        "https://cdn.supabase.example/storage/v1/object/public/product_images/11.jpg",
      ],
    });

    expect(selectInstagramCarouselImageUrls(payload)).toEqual([
      "https://cdn.supabase.example/storage/v1/object/public/product_images/1.jpg",
      "https://cdn.supabase.example/storage/v1/object/public/product_images/2.jpg",
      "https://cdn.supabase.example/storage/v1/object/public/product_images/3.jpg",
      "https://cdn.supabase.example/storage/v1/object/public/product_images/4.jpg",
      "https://cdn.supabase.example/storage/v1/object/public/product_images/5.jpg",
      "https://cdn.supabase.example/storage/v1/object/public/product_images/6.jpg",
      "https://cdn.supabase.example/storage/v1/object/public/product_images/7.jpg",
      "https://cdn.supabase.example/storage/v1/object/public/product_images/8.jpg",
      "https://cdn.supabase.example/storage/v1/object/public/product_images/9.jpg",
      "https://cdn.supabase.example/storage/v1/object/public/product_images/10.jpg",
    ]);
  });
});
