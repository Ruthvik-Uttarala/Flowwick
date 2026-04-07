import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/src/lib/server/db-settings", () => ({
  getDbSettings: vi.fn(),
}));

describe("merchant credential resolution", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.SHOPIFY_STORE_DOMAIN = "env-store.myshopify.com";
    process.env.SHOPIFY_ADMIN_TOKEN = "env-token";
    process.env.INSTAGRAM_ACCESS_TOKEN = "env-instagram";
    process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID = "env-business";
  });

  it("uses only DB-backed settings and never falls back to env merchant credentials", async () => {
    const { getDbSettings } = await import("@/src/lib/server/db-settings");
    vi.mocked(getDbSettings).mockResolvedValue({
      shopifyStoreDomain: "",
      shopifyAdminToken: "",
      instagramAccessToken: "",
      instagramBusinessAccountId: "",
    });

    const { getActiveCredentials } = await import("@/src/lib/server/credentials");
    await expect(getActiveCredentials("user-1")).resolves.toEqual({
      shopifyStoreDomain: "",
      shopifyAdminToken: "",
      instagramAccessToken: "",
      instagramBusinessAccountId: "",
      instagramCredentials: null,
    });
  });
});
