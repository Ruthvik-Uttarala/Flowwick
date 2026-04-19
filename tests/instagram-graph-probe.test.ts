import { describe, expect, it, vi } from "vitest";
import { runInstagramGraphProbe } from "@/src/lib/server/instagram-graph-probe";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("instagram graph probe", () => {
  it("derives target page and instagram ids from debug_token when /me/accounts is empty", async () => {
    const fetchFn: typeof fetch = vi.fn(async (request) => {
      const url =
        typeof request === "string"
          ? new URL(request)
          : request instanceof URL
            ? request
            : new URL(request.url);

      if (url.pathname.endsWith("/me")) {
        return jsonResponse({ id: "user-1", name: "FlowCart User" });
      }

      if (url.pathname.endsWith("/me/permissions")) {
        return jsonResponse({ data: [] });
      }

      if (url.pathname.endsWith("/debug_token")) {
        return jsonResponse({
          data: {
            granular_scopes: [
              {
                target_ids: ["918544081353456", "17841480668974657"],
              },
            ],
          },
        });
      }

      if (url.pathname.endsWith("/me/accounts")) {
        return jsonResponse({ data: [] });
      }

      if (url.pathname.endsWith("/918544081353456")) {
        return jsonResponse(
          {
            error: { message: "Unsupported get request." },
          },
          400
        );
      }

      if (url.pathname.endsWith("/918544081353456/instagram_accounts")) {
        return jsonResponse(
          {
            error: { message: "Unsupported get request." },
          },
          400
        );
      }

      if (url.pathname.endsWith("/17841480668974657")) {
        return jsonResponse({
          id: "17841480668974657",
          username: "flowcartdemo",
        });
      }

      if (url.pathname.endsWith("/17841480668974657/content_publishing_limit")) {
        return jsonResponse({
          data: [{ quota_usage: 0, config: { quota_total: 25 } }],
        });
      }

      throw new Error(`Unexpected fetch: ${url.toString()}`);
    }) as typeof fetch;

    const report = await runInstagramGraphProbe({
      userAccessToken: "user-token-1",
      appId: "meta-app-id",
      appSecret: "meta-app-secret",
      fetchFn,
    });

    expect(report.selectedPageId).toBe("918544081353456");
    expect(report.selectedInstagramId).toBe("17841480668974657");
    expect(report.targetIds).toEqual(["918544081353456", "17841480668974657"]);

    expect(report.probes.find((probe) => probe.probe === "accounts")).toMatchObject({
      status: 200,
      hasAnyPageAccessToken: false,
      selectedPageReachable: false,
      selectedInstagramReachable: false,
    });
    expect(report.probes.find((probe) => probe.probe === "page_lookup")).toMatchObject({
      path: "/918544081353456?fields=id,name,tasks,instagram_business_account{id},connected_instagram_account{id}",
      status: 400,
      selectedPageReachable: false,
    });
    expect(report.probes.find((probe) => probe.probe === "instagram_lookup")).toMatchObject({
      path: "/17841480668974657?fields=id,username",
      status: 200,
      selectedInstagramReachable: true,
    });
    expect(
      report.probes.find((probe) => probe.probe === "content_publishing_limit")
    ).toMatchObject({
      path: "/17841480668974657/content_publishing_limit",
      status: 200,
      selectedInstagramReachable: true,
    });
    expect(
      report.probes.find((probe) => probe.probe === "instagram_lookup_via_page_token")
    ).toBeUndefined();
  });
});
