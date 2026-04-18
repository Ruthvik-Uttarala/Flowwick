import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ConnectionSettings } from "@/src/lib/types";

let settingsStore: ConnectionSettings;

interface MockGraphResponse {
  body: unknown;
  status?: number;
}

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

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function installMetaFetchMock(input: {
  accounts: MockGraphResponse;
  pages?: Record<string, MockGraphResponse>;
}) {
  vi.mocked(global.fetch).mockImplementation(async (request) => {
    const url =
      typeof request === "string"
        ? new URL(request)
        : request instanceof URL
          ? request
          : new URL(request.url);

    if (url.pathname.endsWith("/me/accounts")) {
      return jsonResponse(input.accounts.body, input.accounts.status ?? 200);
    }

    const pageId = url.pathname.split("/").pop() ?? "";
    const pageResponse = input.pages?.[pageId];
    if (pageResponse) {
      return jsonResponse(pageResponse.body, pageResponse.status ?? 200);
    }

    throw new Error(`Unexpected Meta fetch: ${url.toString()}`);
  });
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
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  it("discovers the linked page/account and persists encrypted OAuth credentials", async () => {
    installMetaFetchMock({
      accounts: {
        body: {
          data: [
            {
              id: "page-1",
              name: "FlowCart Page",
              access_token: "page-token-1",
            },
          ],
        },
      },
      pages: {
        "page-1": {
          body: {
            name: "FlowCart Page",
            instagram_business_account: { id: "1789" },
          },
        },
      },
    });

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
    installMetaFetchMock({
      accounts: {
        body: {
          data: [
            {
              id: "page-1",
              name: "FlowCart Page",
              access_token: "page-token-1",
            },
            {
              id: "page-2",
              name: "FlowCart Outlet",
              access_token: "page-token-2",
            },
          ],
        },
      },
      pages: {
        "page-1": {
          body: {
            name: "FlowCart Page",
            instagram_business_account: { id: "1789" },
          },
        },
        "page-2": {
          body: {
            name: "FlowCart Outlet",
            instagram_business_account: { id: "1790" },
          },
        },
      },
    });

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

  it("supports connected_instagram_account discovery during connect and validate without regressing to missing_page_linkage", async () => {
    installMetaFetchMock({
      accounts: {
        body: {
          data: [
            {
              id: "page-1",
              name: "SMB Automation Agent Test",
              access_token: "page-token-1",
            },
          ],
        },
      },
      pages: {
        "page-1": {
          body: {
            name: "SMB Automation Agent Test",
            connected_instagram_account: { id: "178900001" },
          },
        },
      },
    });

    const { completeInstagramOauthConnection, validateInstagramConnection } = await import(
      "@/src/lib/server/instagram-credentials"
    );

    const connected = await completeInstagramOauthConnection({
      userId: "user-123",
      longLivedUserToken: "user-token-1",
      tokenExpiresAt: "2026-04-07T11:00:00.000Z",
    });

    expect(connected.selectionRequired).toBe(false);
    expect(connected.connection.status).toBe("connected");
    expect(settingsStore.instagramConnectionStatus).toBe("connected");
    expect(settingsStore.instagramConnectionErrorCode).toBe("");
    expect(settingsStore.instagramPageId).toBe("page-1");
    expect(settingsStore.instagramBusinessAccountId).toBe("178900001");

    const validated = await validateInstagramConnection("user-123");

    expect(validated.status).toBe("connected");
    expect(settingsStore.instagramConnectionStatus).toBe("connected");
    expect(settingsStore.instagramConnectionErrorCode).toBe("");
    expect(settingsStore.instagramBusinessAccountId).toBe("178900001");
  });

  it("tolerates one page lookup failure and still discovers another linked page", async () => {
    const warnSpy = vi.spyOn(console, "warn");
    installMetaFetchMock({
      accounts: {
        body: {
          data: [
            {
              id: "page-1",
              name: "FlowCart Page",
              access_token: "page-token-1",
            },
            {
              id: "page-2",
              name: "SMB Automation Agent Test",
              access_token: "page-token-2",
            },
          ],
        },
      },
      pages: {
        "page-1": {
          status: 400,
          body: {
            error: { message: "Unsupported get request." },
          },
        },
        "page-2": {
          body: {
            name: "SMB Automation Agent Test",
            connected_instagram_account: { id: "178900002" },
          },
        },
      },
    });

    const { completeInstagramOauthConnection } = await import(
      "@/src/lib/server/instagram-credentials"
    );
    const result = await completeInstagramOauthConnection({
      userId: "user-123",
      longLivedUserToken: "user-token-1",
    });

    expect(result.selectionRequired).toBe(false);
    expect(result.connection.status).toBe("connected");
    expect(settingsStore.instagramPageId).toBe("page-2");
    expect(settingsStore.instagramBusinessAccountId).toBe("178900002");

    const loggedOutput = JSON.stringify(warnSpy.mock.calls);
    expect(loggedOutput).toContain("managed_page_lookup_failed");
    expect(loggedOutput).toContain("\"pageId\":\"page-1\"");
    expect(loggedOutput).toContain("Unsupported get request.");
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
    const infoSpy = vi.spyOn(console, "info");
    settingsStore = {
      ...createEmptySettings(),
      instagramUserAccessToken: encryptInstagramToken("user-token-1"),
      instagramPageId: "page-1",
      instagramPageName: "FlowCart Page",
      instagramBusinessAccountId: "1789",
      instagramConnectionStatus: "connected",
    };
    installMetaFetchMock({
      accounts: {
        body: {
          data: [
            {
              id: "page-1",
              name: "FlowCart Page",
              access_token: "fresh-page-token",
            },
          ],
        },
      },
      pages: {
        "page-1": {
          body: {
            name: "FlowCart Page",
            instagram_business_account: { id: "1789" },
          },
        },
      },
    });

    const { validateInstagramConnection } = await import(
      "@/src/lib/server/instagram-credentials"
    );
    const result = await validateInstagramConnection("user-123");

    expect(result.status).toBe("connected");
    expect(settingsStore.instagramAccessToken).toMatch(/^v1:/);
    expect(decryptInstagramToken(settingsStore.instagramAccessToken)).toBe("fresh-page-token");
    expect(settingsStore.instagramLastValidatedAt).toMatch(/^20/);

    const loggedOutput = JSON.stringify(infoSpy.mock.calls);
    expect(loggedOutput).toContain("validation_started");
    expect(loggedOutput).toContain("validation_persisted");
    expect(loggedOutput).toContain("\"status\":\"connected\"");
    expect(loggedOutput).toContain("\"selectedPageId\":\"page-1\"");
  });

  it("returns missing_page_linkage when no managed pages are returned", async () => {
    const infoSpy = vi.spyOn(console, "info");
    installMetaFetchMock({
      accounts: {
        body: {
          data: [],
        },
      },
    });

    const { completeInstagramOauthConnection } = await import(
      "@/src/lib/server/instagram-credentials"
    );
    const result = await completeInstagramOauthConnection({
      userId: "user-123",
      longLivedUserToken: "user-token-1",
    });

    expect(result.selectionRequired).toBe(false);
    expect(result.connection.status).toBe("missing_page_linkage");
    expect(settingsStore.instagramConnectionErrorCode).toBe("missing_page_linkage");

    const loggedOutput = JSON.stringify(infoSpy.mock.calls);
    expect(loggedOutput).toContain("managed_pages_empty");
    expect(loggedOutput).toContain("oauth_connection_persisted");
  });

  it("returns missing_page_linkage when pages exist but no direct lookup yields an IG link", async () => {
    installMetaFetchMock({
      accounts: {
        body: {
          data: [
            {
              id: "page-1",
              name: "FlowCart Page",
              access_token: "page-token-1",
            },
          ],
        },
      },
      pages: {
        "page-1": {
          body: {
            name: "FlowCart Page",
          },
        },
      },
    });

    const { completeInstagramOauthConnection } = await import(
      "@/src/lib/server/instagram-credentials"
    );
    const result = await completeInstagramOauthConnection({
      userId: "user-123",
      longLivedUserToken: "user-token-1",
    });

    expect(result.connection.status).toBe("missing_page_linkage");
    expect(settingsStore.instagramConnectionErrorCode).toBe("missing_page_linkage");
  });

  it("returns missing_instagram_business_account when the selected page has no normalized IG link", async () => {
    const { encryptInstagramToken } = await import("@/src/lib/server/instagram-crypto");
    settingsStore = {
      ...createEmptySettings(),
      instagramUserAccessToken: encryptInstagramToken("user-token-1"),
      instagramPageId: "page-1",
      instagramPageName: "FlowCart Page",
      instagramBusinessAccountId: "1789",
      instagramConnectionStatus: "connected",
    };
    installMetaFetchMock({
      accounts: {
        body: {
          data: [
            {
              id: "page-1",
              name: "FlowCart Page",
              access_token: "page-token-1",
            },
          ],
        },
      },
      pages: {
        "page-1": {
          body: {
            name: "FlowCart Page",
          },
        },
      },
    });

    const { validateInstagramConnection } = await import(
      "@/src/lib/server/instagram-credentials"
    );
    const result = await validateInstagramConnection("user-123");

    expect(result.status).toBe("missing_instagram_business_account");
    expect(settingsStore.instagramConnectionErrorCode).toBe("missing_instagram_business_account");
  });

  it("preserves the fatal discovery error path when /me/accounts fails before any pages are evaluated", async () => {
    installMetaFetchMock({
      accounts: {
        status: 400,
        body: {
          error: { message: "Failed to discover managed pages." },
        },
      },
    });

    const { completeInstagramOauthConnection } = await import(
      "@/src/lib/server/instagram-credentials"
    );

    await expect(
      completeInstagramOauthConnection({
        userId: "user-123",
        longLivedUserToken: "user-token-1",
      })
    ).rejects.toThrow("Failed to discover managed pages.");
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

  it("logs the discovery link source without leaking raw tokens", async () => {
    installMetaFetchMock({
      accounts: {
        body: {
          data: [
            {
              id: "page-1",
              name: "SMB Automation Agent Test",
              access_token: "page-token-1",
            },
          ],
        },
      },
      pages: {
        "page-1": {
          body: {
            name: "SMB Automation Agent Test",
            connected_instagram_account: { id: "178900001" },
          },
        },
      },
    });

    const infoSpy = vi.spyOn(console, "info");
    const warnSpy = vi.spyOn(console, "warn");
    const { completeInstagramOauthConnection } = await import(
      "@/src/lib/server/instagram-credentials"
    );

    await completeInstagramOauthConnection({
      userId: "user-123",
      longLivedUserToken: "super-secret-user-token",
      statePrefix: "state-123",
    });

    const loggedOutput = [...infoSpy.mock.calls, ...warnSpy.mock.calls]
      .flat()
      .map((entry) => (typeof entry === "string" ? entry : JSON.stringify(entry)))
      .join(" ");

    expect(loggedOutput).toContain("managed_pages_fetched");
    expect(loggedOutput).toContain("managed_page_lookup_result");
    expect(loggedOutput).toContain("oauth_connection_candidates_resolved");
    expect(loggedOutput).toContain("oauth_connection_persisted");
    expect(loggedOutput).toContain("page_link_found_connected_instagram_account");
    expect(loggedOutput).toContain("\"statePrefix\":\"state-123\"");
    expect(loggedOutput).toContain("\"normalizedInstagramBusinessAccountId\":\"178900001\"");
    expect(loggedOutput).toContain("\"status\":\"connected\"");
    expect(loggedOutput).not.toContain("super-secret-user-token");
    expect(loggedOutput).not.toContain("page-token-1");
  });
});
