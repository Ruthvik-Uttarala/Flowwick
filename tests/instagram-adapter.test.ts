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

  it("publishes a single image successfully with the final media id and permalink", async () => {
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

  it("publishes multiple valid bucket images as one carousel post", async () => {
    const fetchMock = vi
      .spyOn(global, "fetch")
      .mockResolvedValueOnce(jsonResponse({ id: "child-1" }))
      .mockResolvedValueOnce(jsonResponse({ status_code: "FINISHED" }))
      .mockResolvedValueOnce(jsonResponse({ id: "child-2" }))
      .mockResolvedValueOnce(jsonResponse({ status_code: "FINISHED" }))
      .mockResolvedValueOnce(jsonResponse({ id: "parent-1" }))
      .mockResolvedValueOnce(jsonResponse({ status_code: "FINISHED" }))
      .mockResolvedValueOnce(jsonResponse({ id: "media-1" }))
      .mockResolvedValueOnce(jsonResponse({ permalink: "https://instagram.com/p/carousel-1/" }));

    const { publishInstagramPostArtifact } = await import("@/src/lib/server/adapters/instagram");
    const result = await publishInstagramPostArtifact({
      payload: makePayload({
        imageUrls: [
          "https://public.example/look-1.jpg",
          "https://public.example/look-2.jpg",
          "https://localhost:3000/not-public.jpg",
        ],
      }),
      instagramCredentials: resolvedInstagramCredentials,
      shopifyProductUrl: "https://demo.myshopify.com/products/flowcart-hat",
      shopifyImageUrl: "https://cdn.shopify.com/s/files/1/unused-shopify.png",
    });

    expect(result).toMatchObject({
      instagramPublished: true,
      instagramPostId: "media-1",
      instagramPostUrl: "https://instagram.com/p/carousel-1/",
    });
    expect(fetchMock).toHaveBeenCalledTimes(8);
    expect(String(fetchMock.mock.calls[0]?.[1]?.body)).toContain(
      encodeURIComponent("https://public.example/look-1.jpg")
    );
    expect(String(fetchMock.mock.calls[0]?.[1]?.body)).toContain("is_carousel_item=true");
    expect(String(fetchMock.mock.calls[2]?.[1]?.body)).toContain(
      encodeURIComponent("https://public.example/look-2.jpg")
    );
    const parentBody = String(fetchMock.mock.calls[4]?.[1]?.body);
    const parentParams = new URLSearchParams(parentBody);
    expect(parentBody).toContain("media_type=CAROUSEL");
    expect(parentBody).toContain(encodeURIComponent("child-1,child-2"));
    expect(parentParams.get("caption")).toContain("Price: $49.99");
    expect(parentParams.get("caption")).toContain(
      "Shop now: https://demo.myshopify.com/products/flowcart-hat"
    );
    expect(parentBody).not.toContain(
      encodeURIComponent("https://cdn.shopify.com/s/files/1/unused-shopify.png")
    );
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

  it("retries with a bucket image when Meta cannot fetch the Shopify image URL", async () => {
    const fetchMock = vi
      .spyOn(global, "fetch")
      .mockResolvedValueOnce(
        jsonResponse(
          {
            error: {
              message: "Could not fetch image URL",
              code: 9004,
              error_subcode: 2207052,
            },
          },
          400
        )
      )
      .mockResolvedValueOnce(jsonResponse({ id: "creation-2" }))
      .mockResolvedValueOnce(jsonResponse({ status_code: "FINISHED" }))
      .mockResolvedValueOnce(jsonResponse({ id: "media-1" }))
      .mockResolvedValueOnce(jsonResponse({ permalink: "https://instagram.com/p/media-1/" }));

    const { publishInstagramPostArtifact } = await import("@/src/lib/server/adapters/instagram");
    const result = await publishInstagramPostArtifact({
      payload: makePayload({
        imageUrls: ["https://public.example/fallback.jpg"],
      }),
      instagramCredentials: resolvedInstagramCredentials,
      shopifyImageUrl: "https://cdn.shopify.com/s/files/1/inaccessible.png",
    });

    expect(result).toMatchObject({
      instagramPublished: true,
      instagramPostId: "media-1",
      instagramPostUrl: "https://instagram.com/p/media-1/",
    });
    expect(fetchMock).toHaveBeenCalledTimes(5);
    expect(String(fetchMock.mock.calls[0]?.[1]?.body)).toContain(
      encodeURIComponent("https://cdn.shopify.com/s/files/1/inaccessible.png")
    );
    expect(String(fetchMock.mock.calls[1]?.[1]?.body)).toContain(
      encodeURIComponent("https://public.example/fallback.jpg")
    );
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

  it("fails when a carousel child container cannot finish processing", async () => {
    vi.spyOn(global, "fetch")
      .mockResolvedValueOnce(jsonResponse({ id: "child-1" }))
      .mockResolvedValueOnce(jsonResponse({ status_code: "ERROR" }));

    const { publishInstagramPostArtifact } = await import("@/src/lib/server/adapters/instagram");
    const result = await publishInstagramPostArtifact({
      payload: makePayload({
        imageUrls: [
          "https://public.example/look-1.jpg",
          "https://public.example/look-2.jpg",
        ],
      }),
      instagramCredentials: resolvedInstagramCredentials,
    });

    expect(result.instagramPublished).toBe(false);
    expect(result.errorMessage).toBe("Instagram media processing failed before publish (error).");
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

  it("fails when the carousel parent container cannot be created", async () => {
    vi.spyOn(global, "fetch")
      .mockResolvedValueOnce(jsonResponse({ id: "child-1" }))
      .mockResolvedValueOnce(jsonResponse({ status_code: "FINISHED" }))
      .mockResolvedValueOnce(jsonResponse({ id: "child-2" }))
      .mockResolvedValueOnce(jsonResponse({ status_code: "FINISHED" }))
      .mockResolvedValueOnce(
        jsonResponse(
          {
            error: {
              message: "Parent create failed",
              code: 999,
            },
          },
          500
        )
      );

    const { publishInstagramPostArtifact } = await import("@/src/lib/server/adapters/instagram");
    const result = await publishInstagramPostArtifact({
      payload: makePayload({
        imageUrls: [
          "https://public.example/look-1.jpg",
          "https://public.example/look-2.jpg",
        ],
      }),
      instagramCredentials: resolvedInstagramCredentials,
    });

    expect(result.instagramPublished).toBe(false);
    expect(result.errorMessage).toBe(
      "Instagram media container creation failed: Parent create failed"
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

  it("updates the same published post id when caption edits are accepted by Meta", async () => {
    const expectedCaption =
      "FlowCart Hat\n\nUpdated caption body.\n\nPrice: $49.99\nQuantity: 8\n\nShop now: https://demo.myshopify.com/products/flowcart-hat";
    const fetchMock = vi
      .spyOn(global, "fetch")
      .mockResolvedValueOnce(
        jsonResponse({
          id: "17895695668004550",
          media_type: "IMAGE",
          media_product_type: "FEED",
          comment_enabled: true,
          caption: "Old caption",
          permalink: "https://instagram.com/p/ig-post-1",
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          success: true,
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          caption: expectedCaption,
          permalink: "https://instagram.com/p/ig-post-1",
        })
      );

    const { updateInstagramPostArtifact } = await import("@/src/lib/server/adapters/instagram");
    const result = await updateInstagramPostArtifact({
      payload: makePayload({ description: "Updated caption body." }),
      instagramCredentials: resolvedInstagramCredentials,
      instagramPostId: "17895695668004550",
      instagramPostUrl: "https://instagram.com/p/ig-post-1",
      shopifyProductUrl: "https://demo.myshopify.com/products/flowcart-hat",
    });

    expect(result).toMatchObject({
      instagramUpdated: true,
      instagramPostId: "17895695668004550",
      outcome: "updated",
      reason: "updated_in_place",
      errorMessage: "",
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[0]?.[0]).toContain("/17895695668004550");
  });

  it("blocks duplicates truthfully when Meta rejects same-post edits as unsupported", async () => {
    const fetchMock = vi
      .spyOn(global, "fetch")
      .mockResolvedValueOnce(
        jsonResponse({
          id: "17895695668004550",
          media_type: "IMAGE",
          media_product_type: "FEED",
          comment_enabled: true,
          caption: "Old caption",
          permalink: "https://instagram.com/p/ig-post-1",
        })
      )
      .mockResolvedValueOnce(
        jsonResponse(
          {
            error: {
              message: "Unsupported post request. Object with ID does not support this operation.",
              code: 100,
            },
          },
          400
        )
      );

    const { updateInstagramPostArtifact } = await import("@/src/lib/server/adapters/instagram");
    const result = await updateInstagramPostArtifact({
      payload: makePayload({ description: "Updated caption body." }),
      instagramCredentials: resolvedInstagramCredentials,
      instagramPostId: "17895695668004550",
      instagramPostUrl: "https://instagram.com/p/ig-post-1",
      shopifyProductUrl: "https://demo.myshopify.com/products/flowcart-hat",
    });

    expect(result.instagramUpdated).toBe(false);
    expect(result.outcome).toBe("unchanged");
    expect(result.reason).toBe("unsupported_edit_path");
    expect(result.errorMessage).toContain("can't be edited in place");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const calledUrls = fetchMock.mock.calls.map((call) => String(call[0]));
    expect(calledUrls.every((url) => url.includes("/17895695668004550"))).toBe(true);
    expect(calledUrls.some((url) => url.includes("/media_publish"))).toBe(false);
    expect(calledUrls.some((url) => /\/media(\?|$)/.test(url))).toBe(false);
  });

  it("retries Graph (#100) comment_enabled-required edits on the same post id with comment_enabled set", async () => {
    const expectedCaption =
      "FlowCart Hat\n\nUpdated caption body.\n\nPrice: $49.99\nQuantity: 8\n\nShop now: https://demo.myshopify.com/products/flowcart-hat";
    const fetchMock = vi
      .spyOn(global, "fetch")
      .mockResolvedValueOnce(
        jsonResponse({
          id: "17895695668004550",
          media_type: "IMAGE",
          media_product_type: "FEED",
          caption: "Old caption",
          permalink: "https://instagram.com/p/ig-post-1",
        })
      )
      .mockResolvedValueOnce(
        jsonResponse(
          {
            error: {
              message: "(#100) The parameter comment_enabled is required",
              code: 100,
            },
          },
          400
        )
      )
      .mockResolvedValueOnce(
        jsonResponse({
          success: true,
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          caption: expectedCaption,
          permalink: "https://instagram.com/p/ig-post-1",
        })
      );

    const { updateInstagramPostArtifact } = await import("@/src/lib/server/adapters/instagram");
    const result = await updateInstagramPostArtifact({
      payload: makePayload({ description: "Updated caption body." }),
      instagramCredentials: resolvedInstagramCredentials,
      instagramPostId: "17895695668004550",
      instagramPostUrl: "https://instagram.com/p/ig-post-1",
      shopifyProductUrl: "https://demo.myshopify.com/products/flowcart-hat",
    });

    expect(result.instagramUpdated).toBe(true);
    expect(result.outcome).toBe("updated");
    expect(result.reason).toBe("updated_in_place");
    expect(result.errorMessage).toBe("");
    expect(fetchMock).toHaveBeenCalledTimes(4);

    const firstEditCall = fetchMock.mock.calls[1];
    const secondEditCall = fetchMock.mock.calls[2];
    expect(String(firstEditCall?.[0])).toContain("/17895695668004550");
    expect(String(secondEditCall?.[0])).toContain("/17895695668004550");
    expect(String(firstEditCall?.[0])).not.toContain("/media_publish");
    expect(String(secondEditCall?.[0])).not.toContain("/media_publish");

    const firstEditBody = String((firstEditCall?.[1] as RequestInit | undefined)?.body ?? "");
    const retryEditBody = String((secondEditCall?.[1] as RequestInit | undefined)?.body ?? "");
    expect(firstEditBody).not.toContain("comment_enabled=");
    expect(retryEditBody).toContain("comment_enabled=true");
  });

  it("returns unchanged when the saved published media type is unsupported for in-place edits", async () => {
    const fetchMock = vi.spyOn(global, "fetch").mockResolvedValueOnce(
      jsonResponse({
        id: "17895695668004550",
        media_type: "STORY",
        media_product_type: "STORY",
        permalink: "https://instagram.com/p/ig-post-1",
      })
    );

    const { updateInstagramPostArtifact } = await import("@/src/lib/server/adapters/instagram");
    const result = await updateInstagramPostArtifact({
      payload: makePayload({ description: "Updated caption body." }),
      instagramCredentials: resolvedInstagramCredentials,
      instagramPostId: "17895695668004550",
      instagramPostUrl: "https://instagram.com/p/ig-post-1",
      shopifyProductUrl: "https://demo.myshopify.com/products/flowcart-hat",
    });

    expect(result.instagramUpdated).toBe(false);
    expect(result.outcome).toBe("unchanged");
    expect(result.reason).toBe("unsupported_media_type");
    expect(result.errorMessage).toContain("can't be edited in place");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
