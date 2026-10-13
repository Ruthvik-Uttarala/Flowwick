import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveApplicationOrigin } from "@/src/lib/server/production-config.mjs";
import {
  buildShopifyCallbackUrl,
  getAuthoritativeAppUrl,
  isAuthoritativeAppRequest,
} from "@/src/lib/server/shopify";
import { buildInstagramCallbackUrl } from "@/src/lib/server/instagram";

const PRODUCTION_ORIGIN = "https://flowwick.vercel.app";

describe("authoritative OAuth origin", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("uses the selected canonical production origin for both callback URLs", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", PRODUCTION_ORIGIN);

    expect(getAuthoritativeAppUrl()).toBe(PRODUCTION_ORIGIN);
    expect(buildShopifyCallbackUrl()).toBe(`${PRODUCTION_ORIGIN}/api/shopify/callback`);
    expect(buildInstagramCallbackUrl()).toBe(`${PRODUCTION_ORIGIN}/api/instagram/callback`);
  });

  it("preserves the localhost callback origins for local development", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3000");

    expect(buildShopifyCallbackUrl()).toBe("http://localhost:3000/api/shopify/callback");
    expect(buildInstagramCallbackUrl()).toBe("http://localhost:3000/api/instagram/callback");
  });

  it("uses the local default only outside production", () => {
    expect(resolveApplicationOrigin({}, { mode: "development" })).toBe("http://localhost:3000");
    expect(() => resolveApplicationOrigin({}, { mode: "production" })).toThrow(
      "NEXT_PUBLIC_APP_URL",
    );
  });

  it.each([
    "http://flowwick.vercel.app",
    "https://localhost",
    "https://localhost:3000",
    "https://127.0.0.1",
    "https://[::1]",
    "https://flowwick.vercel.app:8443",
    "https://flowwick.vercel.app/path",
    "https://flowwick.vercel.app?query=true",
    "https://flowwick.vercel.app#fragment",
    "not-a-url",
  ])("rejects invalid production origin %s", (origin) => {
    expect(() =>
      resolveApplicationOrigin({ NEXT_PUBLIC_APP_URL: origin }, { mode: "production" }),
    ).toThrow("NEXT_PUBLIC_APP_URL");
  });

  it("matches both protocol and host for authoritative requests", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", PRODUCTION_ORIGIN);

    expect(isAuthoritativeAppRequest(new Request(`${PRODUCTION_ORIGIN}/api/shopify/connect`))).toBe(true);
    expect(isAuthoritativeAppRequest(new Request("https://preview-flowwick.vercel.app/api/shopify/connect"))).toBe(false);
    expect(isAuthoritativeAppRequest(new Request("http://flowwick.vercel.app/api/shopify/connect"))).toBe(false);
  });

  it("does not expose secret material in configuration errors", () => {
    const sentinel = "SECRET_SENTINEL_MUST_NOT_LEAK";
    let message = "";
    try {
      resolveApplicationOrigin(
        { NEXT_PUBLIC_APP_URL: "not-a-url", SHOPIFY_CLIENT_SECRET: sentinel, META_APP_SECRET: sentinel },
        { mode: "production" },
      );
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    expect(message).toContain("NEXT_PUBLIC_APP_URL");
    expect(message).not.toContain(sentinel);
  });
});
