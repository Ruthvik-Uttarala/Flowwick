import { beforeEach, describe, expect, it, vi } from "vitest";
import { ActiveInstagramCredentials, LaunchPayload } from "@/src/lib/types";

const resolvedInstagramCredentials: ActiveInstagramCredentials = {
  status: "connected",
  source: "oauth_cached_page_token",
  publishAccessToken: "EAAB-SECRET-TOKEN-123",
  instagramBusinessAccountId: "1789",
  pageId: "page-1",
  pageName: "FlowCart Page",
  hasLongLivedUserToken: true,
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function makePayload(overrides: Partial<LaunchPayload> = {}): LaunchPayload {
  return {
    storeDomain: "demo.myshopify.com",
    shopifyAdminToken: "shpca_live",
    instagramAccessToken: "legacy-token",
    instagramBusinessAccountId: "1789",
    title: "FlowCart Hat",
    description: "Warm wool hat",
    price: 49.99,
    quantity: 8,
    imageUrls: ["https://public.example/hat.jpg"],
    ...overrides,
  };
}

describe("instagram adapter", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
    vi.stubEnv("INSTAGRAM_ENABLED", "true");
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  it("publishes successfully with the final media id and permalink", async () => {
    const fetchMock = vi
      .spyOn(global, "fetch")
      .mockResolvedValueOnce(jsonResponse({ id: "creation-1" }))
      .mockResolvedValueOnce(jsonResponse({ status_code: "FINISHED" }))
      .mockResolvedValueOnce(jsonResponse({ id: "media-1" }))
      .mockResolvedValueOnce(jsonResponse({ permalink: "https://instagram.com/p/media-1/" }));

    const { publishInstagramPostArtifact } = await import("@/src/lib/server/adapters/instagram");
    const result = await publishInstagramPostArtifact({
      payload: makePayload(),
      instagramCredentials: resolvedInstagramCredentials,
      shopifyProductUrl: "https://demo.myshopify.com/products/flowcart-hat",
      shopifyImageUrl: "https://cdn.shopify.com/s/files/1/hat.png",
    });

    expect(result).toMatchObject({
      instagramPublished: true,
      instagramPostId: "media-1",
      instagramPostUrl: "https://instagram.com/p/media-1/",
    });
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(String(fetchMock.mock.calls[0]?.[1]?.body)).toContain(
      encodeURIComponent("https://cdn.shopify.com/s/files/1/hat.png")
    );
    expect(fetchMock.mock.calls[2]?.[0]).toContain("/media_publish");
  });

  it("keeps success when permalink lookup fails after publish", async () => {
    vi.spyOn(global, "fetch")
      .mockResolvedValueOnce(jsonResponse({ id: "creation-1" }))
      .mockResolvedValueOnce(jsonResponse({ status_code: "FINISHED" }))
      .mockResolvedValueOnce(jsonResponse({ id: "media-1" }))
      .mockResolvedValueOnce(
        jsonResponse(
          {
            error: { message: "Lookup failed", code: 2, is_transient: true },
          },
          500
        )
      );

    const { publishInstagramPostArtifact } = await import("@/src/lib/server/adapters/instagram");
    const result = await publishInstagramPostArtifact({
      payload: makePayload(),
      instagramCredentials: resolvedInstagramCredentials,
    });

    expect(result).toMatchObject({
      instagramPublished: true,
      instagramPostId: "media-1",
      instagramPostUrl: "",
      errorMessage: "",
    });
  });

  it("fails early when the credential object is missing", async () => {
    const fetchMock = vi.spyOn(global, "fetch");
    const { publishInstagramPostArtifact } = await import("@/src/lib/server/adapters/instagram");
    const result = await publishInstagramPostArtifact({
      payload: makePayload(),
      instagramCredentials: null,
    });

    expect(result.instagramPublished).toBe(false);
    expect(result.errorMessage).toBe("Instagram credentials are missing.");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fails early when the publish access token is missing", async () => {
    const fetchMock = vi.spyOn(global, "fetch");
    const { publishInstagramPostArtifact } = await import("@/src/lib/server/adapters/instagram");
    const result = await publishInstagramPostArtifact({
      payload: makePayload(),
      instagramCredentials: { ...resolvedInstagramCredentials, publishAccessToken: "   " },
    });

    expect(result.instagramPublished).toBe(false);
    expect(result.errorMessage).toBe("Instagram publish access token is missing.");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fails early when the business account id is missing", async () => {
    const fetchMock = vi.spyOn(global, "fetch");
    const { publishInstagramPostArtifact } = await import("@/src/lib/server/adapters/instagram");
    const result = await publishInstagramPostArtifact({
      payload: makePayload(),
      instagramCredentials: {
        ...resolvedInstagramCredentials,
        instagramBusinessAccountId: "  ",
      },
    });

    expect(result.instagramPublished).toBe(false);
    expect(result.errorMessage).toBe("Instagram business account id is missing.");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects invalid or non-public image urls before calling Meta", async () => {
    const fetchMock = vi.spyOn(global, "fetch");
    const { publishInstagramPostArtifact } = await import("@/src/lib/server/adapters/instagram");
    const result = await publishInstagramPostArtifact({
      payload: makePayload({
        imageUrls: ["/uploads/internal-only.jpg", "https://localhost:3000/hat.jpg"],
      }),
      instagramCredentials: resolvedInstagramCredentials,
      shopifyImageUrl: "http://cdn.shopify.com/s/files/1/hat.png",
    });

    expect(result.instagramPublished).toBe(false);
    expect(result.errorMessage).toContain("external public HTTPS image URL");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns a clear failure when container creation fails", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce(
      jsonResponse(
        {
          error: {
            message: "Container create failed",
            code: 999,
          },
        },
        500
      )
    );

    const { publishInstagramPostArtifact } = await import("@/src/lib/server/adapters/instagram");
    const result = await publishInstagramPostArtifact({
      payload: makePayload(),
      instagramCredentials: resolvedInstagramCredentials,
    });

    expect(result.instagramPublished).toBe(false);
    expect(result.errorMessage).toBe("Instagram media container creation failed: Container create failed");
  });

  it("times out when the media container never reaches a publishable status", async () => {
    vi.spyOn(global, "fetch")
      .mockResolvedValueOnce(jsonResponse({ id: "creation-1" }))
      .mockResolvedValueOnce(jsonResponse({ status_code: "IN_PROGRESS" }))
      .mockResolvedValueOnce(jsonResponse({ status_code: "IN_PROGRESS" }))
      .mockResolvedValueOnce(jsonResponse({ status_code: "IN_PROGRESS" }))
      .mockResolvedValueOnce(jsonResponse({ status_code: "IN_PROGRESS" }))
      .mockResolvedValueOnce(jsonResponse({ status_code: "IN_PROGRESS" }));

    const { publishInstagramPostArtifact } = await import("@/src/lib/server/adapters/instagram");
    const result = await publishInstagramPostArtifact({
      payload: makePayload(),
      instagramCredentials: resolvedInstagramCredentials,
    });

    expect(result.instagramPublished).toBe(false);
    expect(result.errorMessage).toBe(
      "Instagram media processing timed out before publish. Retry in a moment."
    );
  });

  it("fails when the media container enters a terminal error state", async () => {
    vi.spyOn(global, "fetch")
      .mockResolvedValueOnce(jsonResponse({ id: "creation-1" }))
      .mockResolvedValueOnce(jsonResponse({ status_code: "ERROR" }));

    const { publishInstagramPostArtifact } = await import("@/src/lib/server/adapters/instagram");
    const result = await publishInstagramPostArtifact({
      payload: makePayload(),
      instagramCredentials: resolvedInstagramCredentials,
    });

    expect(result.instagramPublished).toBe(false);
    expect(result.errorMessage).toBe("Instagram media processing failed before publish (error).");
  });

  it("fails when Meta rejects media_publish", async () => {
    vi.spyOn(global, "fetch")
      .mockResolvedValueOnce(jsonResponse({ id: "creation-1" }))
      .mockResolvedValueOnce(jsonResponse({ status_code: "FINISHED" }))
      .mockResolvedValueOnce(
        jsonResponse(
          {
            error: {
              message: "Publish failed",
              code: 999,
            },
          },
          500
        )
      );

    const { publishInstagramPostArtifact } = await import("@/src/lib/server/adapters/instagram");
    const result = await publishInstagramPostArtifact({
      payload: makePayload(),
      instagramCredentials: resolvedInstagramCredentials,
    });

    expect(result.instagramPublished).toBe(false);
    expect(result.errorMessage).toBe("Instagram publish failed: Publish failed");
  });

  it("maps Graph auth failures to a reconnect message", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce(
      jsonResponse(
        {
          error: {
            message: "Invalid OAuth access token.",
            code: 190,
            type: "OAuthException",
          },
        },
        401
      )
    );

    const { publishInstagramPostArtifact } = await import("@/src/lib/server/adapters/instagram");
    const result = await publishInstagramPostArtifact({
      payload: makePayload(),
      instagramCredentials: resolvedInstagramCredentials,
    });

    expect(result.instagramPublished).toBe(false);
    expect(result.errorMessage).toBe(
      "Instagram authentication failed. Reconnect Instagram and try again."
    );
  });

  it("maps Graph permission failures to a permission message", async () => {
    vi.spyOn(global, "fetch")
      .mockResolvedValueOnce(jsonResponse({ id: "creation-1" }))
      .mockResolvedValueOnce(jsonResponse({ status_code: "FINISHED" }))
      .mockResolvedValueOnce(
        jsonResponse(
          {
            error: {
              message: "Missing permissions to publish content.",
              code: 10,
            },
          },
          403
        )
      );

    const { publishInstagramPostArtifact } = await import("@/src/lib/server/adapters/instagram");
    const result = await publishInstagramPostArtifact({
      payload: makePayload(),
      instagramCredentials: resolvedInstagramCredentials,
    });

    expect(result.instagramPublished).toBe(false);
    expect(result.errorMessage).toBe(
      "Instagram permissions are missing or incomplete. Reconnect Instagram and verify Meta permissions."
    );
  });

  it("treats malformed Graph responses as real failures", async () => {
    vi.spyOn(global, "fetch")
      .mockResolvedValueOnce(jsonResponse({ id: "creation-1" }))
      .mockResolvedValueOnce(jsonResponse({ status_code: "FINISHED" }))
      .mockResolvedValueOnce(jsonResponse({}));

    const { publishInstagramPostArtifact } = await import("@/src/lib/server/adapters/instagram");
    const result = await publishInstagramPostArtifact({
      payload: makePayload(),
      instagramCredentials: resolvedInstagramCredentials,
    });

    expect(result.instagramPublished).toBe(false);
    expect(result.errorMessage).toBe(
      "Instagram publish failed: Instagram did not return a valid media id."
    );
  });

  it("never leaks raw token values into logs", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce(
      jsonResponse(
        {
          error: {
            message: "Invalid OAuth access token.",
            code: 190,
            type: "OAuthException",
          },
        },
        401
      )
    );

    const warnSpy = vi.spyOn(console, "warn");
    const infoSpy = vi.spyOn(console, "info");

    const { publishInstagramPostArtifact } = await import("@/src/lib/server/adapters/instagram");
    await publishInstagramPostArtifact({
      payload: makePayload(),
      instagramCredentials: resolvedInstagramCredentials,
    });

    const loggedText = [...warnSpy.mock.calls, ...infoSpy.mock.calls]
      .flat()
      .map((entry) => (typeof entry === "string" ? entry : JSON.stringify(entry)))
      .join(" ");

    expect(loggedText).not.toContain(resolvedInstagramCredentials.publishAccessToken);
    expect(loggedText).not.toContain("access_token=EAAB-SECRET-TOKEN-123");
  });
});
