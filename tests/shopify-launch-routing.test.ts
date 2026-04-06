import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
}));

vi.mock("next/headers", () => ({
  headers: vi.fn(),
}));

vi.mock("@/src/components/HomeLanding", () => ({
  HomeLanding: () => null,
}));

vi.mock("@/src/lib/server/auth", () => ({
  extractUserIdFromCookieHeader: vi.fn(),
}));

vi.mock("@/src/lib/server/db-settings", () => ({
  saveDbSettings: vi.fn(),
  getDbSettings: vi.fn(),
}));

describe("Shopify launch routing", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_APP_URL = "https://flowcart.example";
  });

  it("redirects root app-load requests with Shopify launch params to /shopify/launch", async () => {
    const { default: Home } = await import("@/app/page");

    await expect(
      Home({
        searchParams: Promise.resolve({
          host: "YWRtaW4uc2hvcGlmeS5jb20vc3RvcmUvc21iYXV0bw==",
          hmac: "launch-hmac",
          shop: "smbauto.myshopify.com",
        }),
      })
    ).rejects.toThrow(
      "NEXT_REDIRECT:https://flowcart.example/shopify/launch?host=YWRtaW4uc2hvcGlmeS5jb20vc3RvcmUvc21iYXV0bw%3D%3D&hmac=launch-hmac&shop=smbauto.myshopify.com"
    );
  });

  it("renders the normal home page when Shopify launch params are absent", async () => {
    const { default: Home } = await import("@/app/page");
    const result = await Home({ searchParams: Promise.resolve({}) });

    expect(result).toBeTruthy();
  });

  it("redirects authenticated Shopify launches to settings without mutating saved settings", async () => {
    const { headers } = await import("next/headers");
    const { extractUserIdFromCookieHeader } = await import("@/src/lib/server/auth");
    const { saveDbSettings } = await import("@/src/lib/server/db-settings");
    vi.mocked(headers).mockResolvedValue(new Headers({ cookie: "sb-access-token=token" }));
    vi.mocked(extractUserIdFromCookieHeader).mockResolvedValue("user-123");

    const { default: ShopifyLaunchPage } = await import("@/app/shopify/launch/page");

    await expect(
      ShopifyLaunchPage({
        searchParams: Promise.resolve({
          host: "YWRtaW4uc2hvcGlmeS5jb20vc3RvcmUvc21iYXV0bw==",
          hmac: "launch-hmac",
          shop: "smbauto",
          embedded: "1",
        }),
      })
    ).rejects.toThrow(
      "NEXT_REDIRECT:https://flowcart.example/settings?shopDomain=smbauto.myshopify.com"
    );

    expect(saveDbSettings).not.toHaveBeenCalled();
  });

  it("redirects unauthenticated Shopify launches through auth with the settings handoff preserved", async () => {
    const { headers } = await import("next/headers");
    const { extractUserIdFromCookieHeader } = await import("@/src/lib/server/auth");
    vi.mocked(headers).mockResolvedValue(new Headers());
    vi.mocked(extractUserIdFromCookieHeader).mockResolvedValue(null);

    const { default: ShopifyLaunchPage } = await import("@/app/shopify/launch/page");

    await expect(
      ShopifyLaunchPage({
        searchParams: Promise.resolve({
          host: "YWRtaW4uc2hvcGlmeS5jb20vc3RvcmUvc21iYXV0bw==",
          hmac: "launch-hmac",
          shop: "smbauto.myshopify.com",
        }),
      })
    ).rejects.toThrow(
      "NEXT_REDIRECT:https://flowcart.example/auth?redirectTo=%2Fsettings%3FshopDomain%3Dsmbauto.myshopify.com"
    );
  });
});
