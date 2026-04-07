import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ConnectionSettings } from "@/src/lib/types";

let settingsStore: ConnectionSettings;

function createEmptySettings(): ConnectionSettings {
  return {
    shopifyStoreDomain: "",
    shopifyAdminToken: "",
    instagramAccessToken: "",
    instagramBusinessAccountId: "",
    instagramUserAccessToken: "",
    instagramPageId: "",
    instagramPageName: "",
    instagramConnectionStatus: "disconnected",
    instagramConnectionErrorCode: "",
    instagramLastValidatedAt: "",
    instagramTokenExpiresAt: "",
    instagramCandidateAccounts: [],
  };
}

vi.mock("@/src/lib/server/db-settings", () => ({
  getDbSettings: vi.fn(async () => settingsStore),
  saveInstagramConnectionState: vi.fn(
    async (_userId: string, patch: Partial<ConnectionSettings>) => {
      settingsStore = {
        ...settingsStore,
        ...patch,
      };
      return settingsStore;
    }
  ),
  clearInstagramConnectionState: vi.fn(async () => {
    settingsStore = {
      ...settingsStore,
      instagramAccessToken: "",
      instagramBusinessAccountId: "",
      instagramUserAccessToken: "",
      instagramPageId: "",
      instagramPageName: "",
      instagramConnectionStatus: "disconnected",
      instagramConnectionErrorCode: "",
      instagramLastValidatedAt: "",
      instagramTokenExpiresAt: "",
      instagramCandidateAccounts: [],
    };
    return settingsStore;
  }),
}));

describe("instagram credential resolver", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubEnv("INSTAGRAM_ENABLED", "true");
    vi.stubEnv("META_TOKEN_ENCRYPTION_KEY", "flowcart-test-secret");
    settingsStore = createEmptySettings();
    vi.stubGlobal("fetch", vi.fn());
  });

  it("discovers the linked page/account and persists encrypted OAuth credentials", async () => {
    vi.mocked(global.fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [
            {
              id: "page-1",
              name: "FlowCart Page",
              access_token: "page-token-1",
              instagram_business_account: { id: "1789" },
            },
          ],
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      )
    );

    const { decryptInstagramToken } = await import("@/src/lib/server/instagram-crypto");
    const { completeInstagramOauthConnection } = await import(
      "@/src/lib/server/instagram-credentials"
    );

    const result = await completeInstagramOauthConnection({
      userId: "user-123",
      longLivedUserToken: "user-token-1",
      tokenExpiresAt: "2026-04-07T11:00:00.000Z",
    });

    expect(result.selectionRequired).toBe(false);
    expect(result.connection.status).toBe("connected");
    expect(settingsStore.instagramPageId).toBe("page-1");
    expect(settingsStore.instagramPageName).toBe("FlowCart Page");
    expect(settingsStore.instagramBusinessAccountId).toBe("1789");
    expect(settingsStore.instagramUserAccessToken).toMatch(/^v1:/);
    expect(settingsStore.instagramAccessToken).toMatch(/^v1:/);
    expect(decryptInstagramToken(settingsStore.instagramUserAccessToken ?? "")).toBe(
      "user-token-1"
    );
    expect(decryptInstagramToken(settingsStore.instagramAccessToken)).toBe("page-token-1");
  });

  it("stores pending candidates when multiple eligible page/account pairs are discovered", async () => {
    vi.mocked(global.fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [
            {
              id: "page-1",
              name: "FlowCart Page",
              access_token: "page-token-1",
              instagram_business_account: { id: "1789" },
            },
            {
              id: "page-2",
              name: "FlowCart Outlet",
              access_token: "page-token-2",
              instagram_business_account: { id: "1790" },
            },
          ],
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      )
    );

    const { completeInstagramOauthConnection } = await import(
      "@/src/lib/server/instagram-credentials"
    );
    const result = await completeInstagramOauthConnection({
      userId: "user-123",
      longLivedUserToken: "user-token-1",
    });

    expect(result.selectionRequired).toBe(true);
    expect(result.connection.status).toBe("selection_required");
    expect(settingsStore.instagramCandidateAccounts).toEqual([
      {
        pageId: "page-1",
        pageName: "FlowCart Page",
        instagramBusinessAccountId: "1789",
      },
      {
        pageId: "page-2",
        pageName: "FlowCart Outlet",
        instagramBusinessAccountId: "1790",
      },
    ]);
    expect(settingsStore.instagramAccessToken).toBe("");
    expect(settingsStore.instagramPageId).toBe("");
  });

  it("prefers OAuth-backed cached page credentials over legacy fallback", async () => {
    const { encryptInstagramToken } = await import("@/src/lib/server/instagram-crypto");
    settingsStore = {
      ...createEmptySettings(),
      instagramUserAccessToken: encryptInstagramToken("user-token-1"),
      instagramAccessToken: encryptInstagramToken("page-token-1"),
      instagramBusinessAccountId: "1789",
      instagramPageId: "page-1",
      instagramPageName: "FlowCart Page",
      instagramConnectionStatus: "connected",
    };

    const { getActiveInstagramCredentials } = await import(
      "@/src/lib/server/instagram-credentials"
    );
    await expect(getActiveInstagramCredentials("user-123")).resolves.toMatchObject({
      source: "oauth_cached_page_token",
      pageId: "page-1",
      instagramBusinessAccountId: "1789",
      publishAccessToken: "page-token-1",
      hasLongLivedUserToken: true,
    });
  });

  it("falls back to legacy plaintext credentials until reconnect", async () => {
    settingsStore = {
      ...createEmptySettings(),
      instagramAccessToken: "legacy-token",
      instagramBusinessAccountId: "1789",
    };

    const { getActiveInstagramCredentials } = await import(
      "@/src/lib/server/instagram-credentials"
    );
    await expect(getActiveInstagramCredentials("user-123")).resolves.toMatchObject({
      status: "legacy_fallback",
      source: "legacy_fallback",
      publishAccessToken: "legacy-token",
      instagramBusinessAccountId: "1789",
      hasLongLivedUserToken: false,
    });
  });

  it("refreshes the cached publish token during validation", async () => {
    const { encryptInstagramToken, decryptInstagramToken } = await import(
      "@/src/lib/server/instagram-crypto"
    );
    settingsStore = {
      ...createEmptySettings(),
      instagramUserAccessToken: encryptInstagramToken("user-token-1"),
      instagramPageId: "page-1",
      instagramPageName: "FlowCart Page",
      instagramBusinessAccountId: "1789",
      instagramConnectionStatus: "connected",
    };
    vi.mocked(global.fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [
            {
              id: "page-1",
              name: "FlowCart Page",
              access_token: "fresh-page-token",
              instagram_business_account: { id: "1789" },
            },
          ],
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      )
    );

    const { validateInstagramConnection } = await import(
      "@/src/lib/server/instagram-credentials"
    );
    const result = await validateInstagramConnection("user-123");

    expect(result.status).toBe("connected");
    expect(settingsStore.instagramAccessToken).toMatch(/^v1:/);
    expect(decryptInstagramToken(settingsStore.instagramAccessToken)).toBe("fresh-page-token");
    expect(settingsStore.instagramLastValidatedAt).toMatch(/^20/);
  });

  it("clears OAuth-backed fields, pending candidates, and legacy fallback fields on disconnect", async () => {
    settingsStore = {
      ...createEmptySettings(),
      instagramAccessToken: "legacy-or-encrypted-token",
      instagramBusinessAccountId: "1789",
      instagramUserAccessToken: "v1:some:encrypted:value",
      instagramPageId: "page-1",
      instagramPageName: "FlowCart Page",
      instagramConnectionStatus: "connected",
      instagramCandidateAccounts: [
        {
          pageId: "page-2",
          pageName: "FlowCart Outlet",
          instagramBusinessAccountId: "1790",
        },
      ],
    };

    const { clearInstagramConnection } = await import(
      "@/src/lib/server/instagram-credentials"
    );
    const result = await clearInstagramConnection("user-123");

    expect(result.status).toBe("disconnected");
    expect(settingsStore.instagramAccessToken).toBe("");
    expect(settingsStore.instagramBusinessAccountId).toBe("");
    expect(settingsStore.instagramUserAccessToken).toBe("");
    expect(settingsStore.instagramPageId).toBe("");
    expect(settingsStore.instagramCandidateAccounts).toEqual([]);
  });

  it("never logs raw tokens when deriving a publish credential fails", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { encryptInstagramToken } = await import("@/src/lib/server/instagram-crypto");
    settingsStore = {
      ...createEmptySettings(),
      instagramUserAccessToken: encryptInstagramToken("super-secret-user-token"),
      instagramPageId: "page-1",
      instagramPageName: "FlowCart Page",
      instagramBusinessAccountId: "1789",
      instagramConnectionStatus: "connected",
    };
    vi.mocked(global.fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          error: { message: "The access token is invalid.", code: 190 },
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      )
    );

    const { getActiveInstagramCredentials } = await import(
      "@/src/lib/server/instagram-credentials"
    );
    await expect(getActiveInstagramCredentials("user-123")).resolves.toBeNull();

    const loggedOutput = JSON.stringify(warnSpy.mock.calls);
    expect(loggedOutput).not.toContain("super-secret-user-token");
  });
});
