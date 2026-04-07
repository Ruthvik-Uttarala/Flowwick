import { beforeEach, describe, expect, it, vi } from "vitest";
import { INSTAGRAM_OAUTH_SCOPE_PARAM } from "@/src/lib/instagram";

vi.mock("@/src/lib/server/auth", () => ({
  extractUserId: vi.fn(),
}));

vi.mock("@/src/lib/server/instagram-oauth-state", () => {
  class InstagramOauthStatePersistenceError extends Error {
    constructor() {
      super("Instagram connection could not be started. Please refresh and try again.");
    }
  }

  return {
    InstagramOauthStatePersistenceError,
    saveInstagramOauthState: vi.fn(),
  };
});

describe("Instagram connect route", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.META_APP_ID = "meta-app-123";
    process.env.NEXT_PUBLIC_APP_URL = "https://flowcart.example";
  });

  it("starts Meta OAuth from the authoritative host and sets the CSRF state cookie", async () => {
    const { extractUserId } = await import("@/src/lib/server/auth");
    const { saveInstagramOauthState } = await import("@/src/lib/server/instagram-oauth-state");
    vi.mocked(extractUserId).mockResolvedValue("user-123");

    const { GET } = await import("@/app/api/instagram/connect/route");
    const response = await GET(
      new Request("https://flowcart.example/api/instagram/connect", {
        method: "GET",
        headers: { host: "flowcart.example" },
      })
    );

    expect(response.status).toBe(307);
    const location = response.headers.get("location") ?? "";
    expect(location).toContain("https://www.facebook.com/v21.0/dialog/oauth");
    expect(location).toContain(`client_id=${process.env.META_APP_ID}`);
    expect(location).toContain(
      `scope=${encodeURIComponent(INSTAGRAM_OAUTH_SCOPE_PARAM)}`
    );
    expect(location).toContain(
      `redirect_uri=${encodeURIComponent("https://flowcart.example/api/instagram/callback")}`
    );
    expect(saveInstagramOauthState).toHaveBeenCalledOnce();
    expect(response.headers.get("set-cookie")).toContain("flowcart-instagram-oauth-state=");
  });

  it("redirects non-authoritative hosts back to production settings before state creation", async () => {
    const { extractUserId } = await import("@/src/lib/server/auth");
    const { saveInstagramOauthState } = await import("@/src/lib/server/instagram-oauth-state");
    vi.mocked(extractUserId).mockResolvedValue("user-123");

    const { GET } = await import("@/app/api/instagram/connect/route");
    const response = await GET(
      new Request("https://preview-flowcart.vercel.app/api/instagram/connect", {
        method: "GET",
        headers: { host: "preview-flowcart.vercel.app" },
      })
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://flowcart.example/settings?instagram_error=app_url_mismatch"
    );
    expect(saveInstagramOauthState).not.toHaveBeenCalled();
  });

  it("returns 401 when unauthenticated", async () => {
    const { extractUserId } = await import("@/src/lib/server/auth");
    vi.mocked(extractUserId).mockResolvedValue(null);

    const { GET } = await import("@/app/api/instagram/connect/route");
    const response = await GET(
      new Request("https://flowcart.example/api/instagram/connect", {
        method: "GET",
        headers: { host: "flowcart.example" },
      })
    );

    expect(response.status).toBe(401);
  });

  it("sanitizes oauth state persistence failures for the browser", async () => {
    const { extractUserId } = await import("@/src/lib/server/auth");
    const { InstagramOauthStatePersistenceError, saveInstagramOauthState } = await import(
      "@/src/lib/server/instagram-oauth-state"
    );
    vi.mocked(extractUserId).mockResolvedValue("user-123");
    vi.mocked(saveInstagramOauthState).mockRejectedValue(
      new InstagramOauthStatePersistenceError()
    );

    const { GET } = await import("@/app/api/instagram/connect/route");
    const response = await GET(
      new Request("https://flowcart.example/api/instagram/connect", {
        method: "GET",
        headers: { host: "flowcart.example" },
      })
    );

    const payload = (await response.json()) as {
      ok: boolean;
      data?: { code?: string };
      error?: { message?: string };
    };

    expect(response.status).toBe(500);
    expect(payload.data?.code).toBe("oauth_state_persist_failed");
    expect(payload.error?.message).toBe(
      "Instagram connection could not be started. Please refresh and try again."
    );
  });
});
