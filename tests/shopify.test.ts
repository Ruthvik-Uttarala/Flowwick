import { describe, expect, it } from "vitest";
import {
  canonicalizeShopifyShopDomain,
  getShopifyLaunchShopDomain,
  getStandaloneShopifyConnectDomain,
  isShopifyAppLaunch,
  SHOPIFY_OAUTH_ERROR_MESSAGES,
  SHOPIFY_STANDALONE_CONNECT_PARAM,
  SHOPIFY_STANDALONE_CONNECT_SHOP_PARAM,
  getShopifyConnectRedirectUrl,
  SHOPIFY_OAUTH_SCOPE_PARAM,
  normalizeShopifyDomain,
  shouldAutostartStandaloneShopifyConnect,
  shopifyDomainsMatch,
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

  it("canonicalizes all accepted forms of the same shop domain identically", () => {
    expect(canonicalizeShopifyShopDomain("smbauto")).toBe("smbauto.myshopify.com");
    expect(canonicalizeShopifyShopDomain("smbauto.myshopify.com")).toBe(
      "smbauto.myshopify.com"
    );
    expect(canonicalizeShopifyShopDomain("https://smbauto.myshopify.com/admin")).toBe(
      "smbauto.myshopify.com"
    );
    expect(shopifyDomainsMatch("smbauto", "smbauto.myshopify.com")).toBe(true);
    expect(
      shopifyDomainsMatch("smbauto.myshopify.com", "https://smbauto.myshopify.com/admin")
    ).toBe(true);
  });

  it("rejects non-shopify hostnames", () => {
    expect(() => normalizeShopifyDomain("example.com")).toThrow(
      "Enter a valid Shopify store domain"
    );
  });

  it("exports a stable shared OAuth scope string", () => {
    expect(SHOPIFY_OAUTH_SCOPE_PARAM).toBe(
      "write_products,read_publications,write_publications"
    );
  });

  it("includes the required callback error codes", () => {
    expect(SHOPIFY_OAUTH_ERROR_MESSAGES.invalid_hmac).toContain("signature");
    expect(SHOPIFY_OAUTH_ERROR_MESSAGES.token_verification_failed).toContain(
      "could not be verified"
    );
    expect(SHOPIFY_OAUTH_ERROR_MESSAGES.oauth_state_persist_failed).toContain(
      "Please refresh and try again"
    );
  });

  it("returns the production settings redirect only for app-url mismatch errors", () => {
    expect(
      getShopifyConnectRedirectUrl({
        code: "app_url_mismatch",
        productionSettingsUrl: "https://flowcart.example/settings?shopify_error=app_url_mismatch",
      })
    ).toBe("https://flowcart.example/settings?shopify_error=app_url_mismatch");

    expect(
      getShopifyConnectRedirectUrl({
        code: "oauth_state_persist_failed",
        productionSettingsUrl: "https://flowcart.example/settings",
      })
    ).toBe("");
  });

  it("autostarts standalone reconnect only for explicit FlowCart handoff params", () => {
    const launchParams = new URLSearchParams({
      host: "YWRtaW4uc2hvcGlmeS5jb20vc3RvcmUvc21iYXV0bw==",
      hmac: "launch-hmac",
      embedded: "1",
      shop: "smbauto.myshopify.com",
    });
    expect(shouldAutostartStandaloneShopifyConnect(launchParams)).toBe(false);

    const handoffParams = new URLSearchParams({
      [SHOPIFY_STANDALONE_CONNECT_PARAM]: "1",
      [SHOPIFY_STANDALONE_CONNECT_SHOP_PARAM]: "smbauto",
    });
    expect(shouldAutostartStandaloneShopifyConnect(handoffParams)).toBe(true);
    expect(getStandaloneShopifyConnectDomain(handoffParams)).toBe("smbauto.myshopify.com");
  });

  it("detects Shopify app launch params without confusing them for OAuth reconnect", () => {
    const launchParams = new URLSearchParams({
      host: "YWRtaW4uc2hvcGlmeS5jb20vc3RvcmUvc21iYXV0bw==",
      hmac: "launch-hmac",
      shop: "smbauto",
    });

    expect(isShopifyAppLaunch(launchParams)).toBe(true);
    expect(getShopifyLaunchShopDomain(launchParams)).toBe("smbauto.myshopify.com");
    expect(shouldAutostartStandaloneShopifyConnect(launchParams)).toBe(false);
  });
});
