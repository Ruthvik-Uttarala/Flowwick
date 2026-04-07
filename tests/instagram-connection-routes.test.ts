import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/src/lib/server/auth", () => ({
  extractUserId: vi.fn(),
}));

vi.mock("@/src/lib/server/instagram-credentials", () => ({
  clearInstagramConnection: vi.fn(),
  selectInstagramCandidate: vi.fn(),
  validateInstagramConnection: vi.fn(),
}));

describe("Instagram connection routes", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("validates the current Instagram connection", async () => {
    const { extractUserId } = await import("@/src/lib/server/auth");
    const { validateInstagramConnection } = await import(
      "@/src/lib/server/instagram-credentials"
    );

    vi.mocked(extractUserId).mockResolvedValue("user-123");
    vi.mocked(validateInstagramConnection).mockResolvedValue({
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
      tokenExpiresAt: "",
      candidates: [],
    });

    const { POST } = await import("@/app/api/instagram/validate/route");
    const response = await POST(
      new Request("https://flowcart.example/api/instagram/validate", {
        method: "POST",
      })
    );
    const payload = (await response.json()) as {
      ok: boolean;
      data?: { message?: string };
    };

    expect(response.status).toBe(200);
    expect(payload.data?.message).toBe("Instagram connection is valid.");
  });

  it("disconnects and returns the cleared connection summary", async () => {
    const { extractUserId } = await import("@/src/lib/server/auth");
    const { clearInstagramConnection } = await import(
      "@/src/lib/server/instagram-credentials"
    );

    vi.mocked(extractUserId).mockResolvedValue("user-123");
    vi.mocked(clearInstagramConnection).mockResolvedValue({
      enabled: true,
      status: "disconnected",
      statusLabel: "Disconnected",
      source: "none",
      selectedPageId: "",
      selectedPageName: "",
      selectedInstagramBusinessAccountId: "",
      hasLongLivedUserToken: false,
      hasPublishCredential: false,
      canPublish: false,
      needsReconnect: false,
      errorCode: "",
      lastValidatedAt: "",
      tokenExpiresAt: "",
      candidates: [],
    });

    const { POST } = await import("@/app/api/instagram/disconnect/route");
    const response = await POST(
      new Request("https://flowcart.example/api/instagram/disconnect", {
        method: "POST",
      })
    );
    const payload = (await response.json()) as {
      ok: boolean;
      data?: { message?: string };
    };

    expect(response.status).toBe(200);
    expect(payload.data?.message).toBe("Instagram disconnected.");
  });

  it("requires a concrete candidate selection payload", async () => {
    const { extractUserId } = await import("@/src/lib/server/auth");
    vi.mocked(extractUserId).mockResolvedValue("user-123");

    const { POST } = await import("@/app/api/instagram/connect/select/route");
    const response = await POST(
      new Request("https://flowcart.example/api/instagram/connect/select", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pageId: "page-1" }),
      })
    );

    expect(response.status).toBe(400);
  });

  it("returns a conflict when the candidate account is no longer available", async () => {
    const { extractUserId } = await import("@/src/lib/server/auth");
    const { selectInstagramCandidate } = await import(
      "@/src/lib/server/instagram-credentials"
    );

    vi.mocked(extractUserId).mockResolvedValue("user-123");
    vi.mocked(selectInstagramCandidate).mockRejectedValue(
      new Error("The selected Instagram account is no longer available.")
    );

    const { POST } = await import("@/app/api/instagram/connect/select/route");
    const response = await POST(
      new Request("https://flowcart.example/api/instagram/connect/select", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pageId: "page-1",
          instagramBusinessAccountId: "1789",
        }),
      })
    );

    expect(response.status).toBe(409);
  });
});
