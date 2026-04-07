import { describe, expect, it, vi } from "vitest";
import { mergeConnectionSettings } from "@/src/lib/server/db-settings";
import { SECRET_MASK, getSettingsStatus, redactSettingsForClient } from "@/src/lib/server/settings";

describe("settings merge and readiness", () => {
  it("redacts secrets for browser settings payloads", () => {
    expect(
      redactSettingsForClient({
        shopifyStoreDomain: "demo.myshopify.com",
        shopifyAdminToken: "shpca_123",
        instagramAccessToken: "ig-token",
        instagramBusinessAccountId: "1789",
        instagramUserAccessToken: "ig-user-token",
      })
    ).toEqual({
      shopifyStoreDomain: "demo.myshopify.com",
      shopifyAdminToken: SECRET_MASK,
      instagramAccessToken: SECRET_MASK,
      instagramBusinessAccountId: "1789",
      instagramUserAccessToken: SECRET_MASK,
    });
  });

  it("preserves masked instagram tokens and clears Shopify auth on domain change", () => {
    expect(
      mergeConnectionSettings(
        {
          shopifyStoreDomain: "old-store.myshopify.com",
          shopifyAdminToken: "shpca_old",
          instagramAccessToken: "ig-old",
          instagramBusinessAccountId: "1789",
          instagramUserAccessToken: "ig-user-old",
        },
        {
          shopifyStoreDomain: "new-store",
          instagramAccessToken: SECRET_MASK,
          instagramUserAccessToken: SECRET_MASK,
        }
      )
    ).toMatchObject({
      shopifyStoreDomain: "new-store.myshopify.com",
      shopifyAdminToken: "",
      instagramAccessToken: "ig-old",
      instagramBusinessAccountId: "1789",
      instagramUserAccessToken: "ig-user-old",
    });
  });

  it("marks Shopify as reauthorization-required until the token exists", () => {
    vi.stubEnv("INSTAGRAM_ENABLED", "true");

    expect(
      getSettingsStatus({
        shopifyStoreDomain: "demo.myshopify.com",
        shopifyAdminToken: "",
        instagramAccessToken: "ig-token",
        instagramBusinessAccountId: "1789",
      })
    ).toMatchObject({
      shopifyStoreDomainPresent: true,
      shopifyConnected: false,
      shopifyReauthorizationRequired: true,
      configured: true,
      readyForLaunch: false,
    });

    expect(
      getSettingsStatus({
        shopifyStoreDomain: "demo.myshopify.com",
        shopifyAdminToken: "shpca_live",
        instagramAccessToken: "ig-token",
        instagramBusinessAccountId: "1789",
      })
    ).toMatchObject({
      shopifyConnected: true,
      shopifyReauthorizationRequired: false,
      readyForLaunch: true,
    });

    vi.unstubAllEnvs();
  });
});
