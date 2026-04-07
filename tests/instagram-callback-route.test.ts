import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/src/lib/server/instagram-oauth-state", () => ({
  getInstagramOauthState: vi.fn(),
  deleteInstagramOauthState: vi.fn(),
}));

vi.mock("@/src/lib/server/instagram-credentials", () => ({
  completeInstagramOauthConnection: vi.fn(),
}));

vi.mock("@/src/lib/server/instagram", async () => {
  const actual = await vi.importActual<typeof import("@/src/lib/server/instagram")>(
    "@/src/lib/server/instagram"
  );
  return {
    ...actual,
    exchangeInstagramCodeForLongLivedUserToken: vi.fn(),
  };
});

describe("Instagram callback route", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_APP_URL = "https://flowcart.example";
  });

  it("redirects to settings when the callback is missing required params", async () => {
    const { GET } = await import("@/app/api/instagram/callback/route");
    const response = await GET(
      new Request("https://flowcart.example/api/instagram/callback", {
        headers: { host: "flowcart.example" },
      })
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://flowcart.example/settings?instagram_error=missing_params"
    );
    expect(response.headers.get("set-cookie")).toContain("flowcart-instagram-oauth-state=");
  });

  it("rejects state-cookie mismatches before token exchange", async () => {
    const { GET } = await import("@/app/api/instagram/callback/route");
    const response = await GET(
      new Request("https://flowcart.example/api/instagram/callback?code=abc&state=state-123", {
        headers: {
          host: "flowcart.example",
          cookie: "flowcart-instagram-oauth-state=other-state",
        },
      })
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://flowcart.example/settings?instagram_error=invalid_state"
    );
  });

  it("rejects expired oauth states and cleans them up", async () => {
    const { getInstagramOauthState, deleteInstagramOauthState } = await import(
      "@/src/lib/server/instagram-oauth-state"
    );
    vi.mocked(getInstagramOauthState).mockResolvedValue({
      state: "state-123",
      user_id: "user-123",
      created_at: "2026-04-07T10:00:00.000Z",
      expires_at: "2026-04-07T10:05:00.000Z",
    });

    const { GET } = await import("@/app/api/instagram/callback/route");
    const response = await GET(
      new Request("https://flowcart.example/api/instagram/callback?code=abc&state=state-123", {
        headers: {
          host: "flowcart.example",
          cookie: "flowcart-instagram-oauth-state=state-123",
        },
      })
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://flowcart.example/settings?instagram_error=expired_state"
    );
    expect(deleteInstagramOauthState).toHaveBeenCalledWith("state-123");
  });

  it("stores a successful connection outcome and never logs raw tokens", async () => {
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const { getInstagramOauthState, deleteInstagramOauthState } = await import(
      "@/src/lib/server/instagram-oauth-state"
    );
    const { exchangeInstagramCodeForLongLivedUserToken } = await import(
      "@/src/lib/server/instagram"
    );
    const { completeInstagramOauthConnection } = await import(
      "@/src/lib/server/instagram-credentials"
    );

    vi.mocked(getInstagramOauthState).mockResolvedValue({
      state: "state-123",
      user_id: "user-123",
      created_at: "2026-04-07T10:00:00.000Z",
      expires_at: "2999-04-07T10:10:00.000Z",
    });
    vi.mocked(exchangeInstagramCodeForLongLivedUserToken).mockResolvedValue({
      shortLivedUserToken: "short-lived-raw-token",
      longLivedUserToken: "long-lived-raw-token",
      expiresIn: 3600,
    });
    vi.mocked(completeInstagramOauthConnection).mockResolvedValue({
      selectionRequired: false,
      connection: {
        enabled: true,
        status: "connected",
        statusLabel: "Connected",
        source: "oauth_cached_page_token",
        selectedPageId: "page-1",
        selectedPageName: "FlowCart Page",
        selectedInstagramBusinessAccountId: "1789",
        hasLongLivedUserToken: true,
        hasPublishCredential: true,
        canPublish: true,
        needsReconnect: false,
        errorCode: "",
        lastValidatedAt: "2026-04-07T10:00:00.000Z",
        tokenExpiresAt: "2026-04-07T11:00:00.000Z",
        candidates: [],
      },
    });

    const { GET } = await import("@/app/api/instagram/callback/route");
    const response = await GET(
      new Request("https://flowcart.example/api/instagram/callback?code=abc&state=state-123", {
        headers: {
          host: "flowcart.example",
          cookie: "flowcart-instagram-oauth-state=state-123",
        },
      })
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://flowcart.example/settings?instagram_connected=true"
    );
    expect(deleteInstagramOauthState).toHaveBeenCalledWith("state-123");

    const loggedOutput = JSON.stringify(infoSpy.mock.calls);
    expect(loggedOutput).not.toContain("short-lived-raw-token");
    expect(loggedOutput).not.toContain("long-lived-raw-token");
  });

  it("redirects back to selection when multiple eligible accounts are found", async () => {
    const { getInstagramOauthState } = await import("@/src/lib/server/instagram-oauth-state");
    const { exchangeInstagramCodeForLongLivedUserToken } = await import(
      "@/src/lib/server/instagram"
    );
    const { completeInstagramOauthConnection } = await import(
      "@/src/lib/server/instagram-credentials"
    );

    vi.mocked(getInstagramOauthState).mockResolvedValue({
      state: "state-123",
      user_id: "user-123",
      created_at: "2026-04-07T10:00:00.000Z",
      expires_at: "2999-04-07T10:10:00.000Z",
    });
    vi.mocked(exchangeInstagramCodeForLongLivedUserToken).mockResolvedValue({
      shortLivedUserToken: "short-lived-token",
      longLivedUserToken: "long-lived-token",
      expiresIn: 3600,
    });
    vi.mocked(completeInstagramOauthConnection).mockResolvedValue({
      selectionRequired: true,
      connection: {
        enabled: true,
        status: "selection_required",
        statusLabel: "Choose account",
        source: "none",
        selectedPageId: "",
        selectedPageName: "",
        selectedInstagramBusinessAccountId: "",
        hasLongLivedUserToken: true,
        hasPublishCredential: false,
        canPublish: false,
        needsReconnect: false,
        errorCode: "",
        lastValidatedAt: "",
        tokenExpiresAt: "",
        candidates: [
          {
            pageId: "page-1",
            pageName: "FlowCart Page",
            instagramBusinessAccountId: "1789",
          },
        ],
      },
    });

    const { GET } = await import("@/app/api/instagram/callback/route");
    const response = await GET(
      new Request("https://flowcart.example/api/instagram/callback?code=abc&state=state-123", {
        headers: {
          host: "flowcart.example",
          cookie: "flowcart-instagram-oauth-state=state-123",
        },
      })
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://flowcart.example/settings?instagram_selection=required"
    );
  });

  it("maps token exchange failures back to settings", async () => {
    const { getInstagramOauthState, deleteInstagramOauthState } = await import(
      "@/src/lib/server/instagram-oauth-state"
    );
    const { exchangeInstagramCodeForLongLivedUserToken } = await import(
      "@/src/lib/server/instagram"
    );

    vi.mocked(getInstagramOauthState).mockResolvedValue({
      state: "state-123",
      user_id: "user-123",
      created_at: "2026-04-07T10:00:00.000Z",
      expires_at: "2999-04-07T10:10:00.000Z",
    });
    vi.mocked(exchangeInstagramCodeForLongLivedUserToken).mockRejectedValue(
      new Error("oauth exchange failed")
    );

    const { GET } = await import("@/app/api/instagram/callback/route");
    const response = await GET(
      new Request("https://flowcart.example/api/instagram/callback?code=abc&state=state-123", {
        headers: {
          host: "flowcart.example",
          cookie: "flowcart-instagram-oauth-state=state-123",
        },
      })
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://flowcart.example/settings?instagram_error=token_exchange_failed"
    );
    expect(deleteInstagramOauthState).toHaveBeenCalledWith("state-123");
  });
});
