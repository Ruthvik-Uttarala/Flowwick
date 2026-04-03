import { describe, expect, it } from "vitest";
import {
  SHOPIFY_CALLBACK_ERROR_MESSAGES,
  SHOPIFY_OAUTH_SCOPE_PARAM,
  normalizeShopifyDomain,
} from "@/src/lib/shopify";

describe("shopify shared helpers", () => {
  it("normalizes bare subdomains to myshopify domains", () => {
    expect(normalizeShopifyDomain("smbauto")).toBe("smbauto.myshopify.com");
  });

  it("normalizes https URLs down to the hostname", () => {
    expect(normalizeShopifyDomain("https://demo-shop.myshopify.com/admin")).toBe(
      "demo-shop.myshopify.com"
    );
  });

  it("rejects non-shopify hostnames", () => {
    expect(() => normalizeShopifyDomain("example.com")).toThrow(
      "Enter a valid Shopify store domain"
    );
  });

  it("exports a stable shared OAuth scope string", () => {
    expect(SHOPIFY_OAUTH_SCOPE_PARAM).toBe(
      "write_products,read_locations,read_inventory,read_publications,write_publications"
    );
  });

  it("includes the required callback error codes", () => {
    expect(SHOPIFY_CALLBACK_ERROR_MESSAGES.invalid_hmac).toContain("signature");
    expect(SHOPIFY_CALLBACK_ERROR_MESSAGES.token_verification_failed).toContain(
      "could not be verified"
    );
  });
});
