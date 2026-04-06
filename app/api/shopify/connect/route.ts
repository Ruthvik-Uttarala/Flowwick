import { NextResponse } from "next/server";
import { extractUserId } from "@/src/lib/server/auth";
import { errorResponse } from "@/src/lib/server/api-response";
import { getDbSettings, saveDbSettings } from "@/src/lib/server/db-settings";
import {
  SHOPIFY_OAUTH_STATE_COOKIE,
  SHOPIFY_OAUTH_STATE_TTL_SECONDS,
  buildShopifyAuthorizeUrl,
  buildShopifyIframeEscapePage,
  buildShopifySettingsUrl,
  generateShopifyOauthState,
  getRequestHost,
  getShopifyClientId,
  getShopifyClientSecret,
  isAuthoritativeAppRequest,
  isUnsupportedShopifyAdminContext,
} from "@/src/lib/server/shopify";
import {
  SHOPIFY_OAUTH_ERROR_MESSAGES,
  safeNormalizeShopifyDomain,
  normalizeShopifyDomain,
} from "@/src/lib/shopify";
import {
  ShopifyOauthStatePersistenceError,
  saveShopifyOauthState,
} from "@/src/lib/server/shopify-oauth-state";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface PreparedShopifyConnect {
  installUrl: string;
  normalizedShopDomain: string;
  savedSettingsShopNormalized: string;
  state: string;
}

function logShopifyConnectTrace(
  stage: string,
  input: {
    host: string;
    requestedShopDomain: string;
    normalizedShopDomain?: string;
    savedSettingsShopNormalized?: string;
    statePrefix?: string;
  }
): void {
  console.info("[flowcart:shopify:connect]", {
    stage,
    ...input,
  });
}

function normalizeRequestedShopDomain(value: string): string {
  const normalized = safeNormalizeShopifyDomain(value);
  return normalized || value.trim();
}

function buildStandaloneSettingsResponse(
  request: Request,
  input: {
    errorCode: "app_url_mismatch" | "unsupported_shopify_context";
    shopDomain: string;
    autostartConnect: boolean;
  }
): NextResponse {
  const targetUrl = buildShopifySettingsUrl({
    errorCode: input.errorCode,
    shopDomain: input.shopDomain,
    autostartConnect: input.autostartConnect,
  });

  if (isUnsupportedShopifyAdminContext(request)) {
    return new NextResponse(
      buildShopifyIframeEscapePage(
        targetUrl,
        SHOPIFY_OAUTH_ERROR_MESSAGES[input.errorCode]
      ),
      {
        status: 200,
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-store",
        },
      }
    );
  }

  return NextResponse.redirect(new URL(targetUrl));
}

async function extractRequestShopDomain(request: Request): Promise<string> {
  if (request.method === "GET") {
    return new URL(request.url).searchParams.get("shopDomain")?.trim() ?? "";
  }

  const body = (await request.json().catch(() => ({}))) as { shopDomain?: string };
  return body.shopDomain?.trim() ?? "";
}

async function prepareShopifyConnect(
  userId: string,
  requestedShopDomain: string
): Promise<PreparedShopifyConnect> {
  const savedSettings = await getDbSettings(userId);

  let normalizedShopDomain = "";
  try {
    normalizedShopDomain = normalizeShopifyDomain(
      requestedShopDomain || savedSettings.shopifyStoreDomain
    );
  } catch (error) {
    throw new Error(
      error instanceof Error ? error.message : "Enter a valid Shopify store domain."
    );
  }

  if (!normalizedShopDomain) {
    throw new Error("Enter your Shopify store domain before connecting.");
  }

  const savedDomain = safeNormalizeShopifyDomain(savedSettings.shopifyStoreDomain || "");
  if (normalizedShopDomain !== savedDomain) {
    await saveDbSettings(userId, { shopifyStoreDomain: normalizedShopDomain });
  }

  if (!getShopifyClientId() || !getShopifyClientSecret()) {
    throw new Error("Shopify OAuth is not configured on the server.");
  }

  const state = generateShopifyOauthState();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SHOPIFY_OAUTH_STATE_TTL_SECONDS * 1000);

  await saveShopifyOauthState({
    state,
    userId,
    shopDomain: normalizedShopDomain,
    createdAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
  });

  return {
    state,
    installUrl: buildShopifyAuthorizeUrl(normalizedShopDomain, state),
    normalizedShopDomain,
    savedSettingsShopNormalized: savedDomain,
  };
}

function withOauthStateCookie(response: NextResponse, state: string): NextResponse {
  response.cookies.set(SHOPIFY_OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SHOPIFY_OAUTH_STATE_TTL_SECONDS,
  });
  return response;
}

export async function GET(request: Request) {
  try {
    const userId = await extractUserId(request);
    if (!userId) {
      return errorResponse("Not authenticated.", { status: 401 });
    }

    const requestedShopDomain = normalizeRequestedShopDomain(
      new URL(request.url).searchParams.get("shopDomain") ?? ""
    );
    const requestHost = getRequestHost(request);

    if (!isAuthoritativeAppRequest(request)) {
      logShopifyConnectTrace("app_url_mismatch", {
        host: requestHost,
        requestedShopDomain,
      });
      return buildStandaloneSettingsResponse(request, {
        errorCode: "app_url_mismatch",
        shopDomain: requestedShopDomain,
        autostartConnect: true,
      });
    }

    if (isUnsupportedShopifyAdminContext(request)) {
      logShopifyConnectTrace("unsupported_shopify_context", {
        host: requestHost,
        requestedShopDomain,
      });
      return buildStandaloneSettingsResponse(request, {
        errorCode: "unsupported_shopify_context",
        shopDomain: requestedShopDomain,
        autostartConnect: true,
      });
    }

    const prepared = await prepareShopifyConnect(userId, requestedShopDomain);
    logShopifyConnectTrace("redirect_to_shopify", {
      host: requestHost,
      requestedShopDomain,
      normalizedShopDomain: prepared.normalizedShopDomain,
      savedSettingsShopNormalized: prepared.savedSettingsShopNormalized,
      statePrefix: prepared.state.slice(0, 8),
    });
    return withOauthStateCookie(NextResponse.redirect(prepared.installUrl), prepared.state);
  } catch (error) {
    if (error instanceof ShopifyOauthStatePersistenceError) {
      return errorResponse(error.message, {
        status: 500,
        data: { code: "oauth_state_persist_failed" },
      });
    }

    const message =
      error instanceof Error ? error.message : "Failed to initiate Shopify connection.";
    console.error("[flowcart:shopify:connect:get]", message);
    const status =
      message.includes("valid Shopify store domain") ||
      message.includes("Enter your Shopify store domain")
        ? 400
        : message.includes("Not authenticated")
          ? 401
          : 500;
    return errorResponse(message, { status });
  }
}

export async function POST(request: Request) {
  try {
    const userId = await extractUserId(request);
    if (!userId) {
      return errorResponse("Not authenticated.", { status: 401 });
    }

    const requestedShopDomain = normalizeRequestedShopDomain(await extractRequestShopDomain(request));
    const requestHost = getRequestHost(request);

    if (!isAuthoritativeAppRequest(request)) {
      logShopifyConnectTrace("post_app_url_mismatch", {
        host: requestHost,
        requestedShopDomain,
      });
      return errorResponse(SHOPIFY_OAUTH_ERROR_MESSAGES.app_url_mismatch, {
        status: 409,
        data: {
          code: "app_url_mismatch",
          productionSettingsUrl: buildShopifySettingsUrl({
            errorCode: "app_url_mismatch",
            shopDomain: requestedShopDomain,
            autostartConnect: true,
          }),
        },
      });
    }

    if (isUnsupportedShopifyAdminContext(request)) {
      logShopifyConnectTrace("post_unsupported_shopify_context", {
        host: requestHost,
        requestedShopDomain,
      });
      return errorResponse(SHOPIFY_OAUTH_ERROR_MESSAGES.unsupported_shopify_context, {
        status: 409,
        data: {
          code: "unsupported_shopify_context",
          productionSettingsUrl: buildShopifySettingsUrl({
            errorCode: "unsupported_shopify_context",
            shopDomain: requestedShopDomain,
            autostartConnect: true,
          }),
        },
      });
    }

    const prepared = await prepareShopifyConnect(userId, requestedShopDomain);
    logShopifyConnectTrace("post_redirect_to_shopify", {
      host: requestHost,
      requestedShopDomain,
      normalizedShopDomain: prepared.normalizedShopDomain,
      savedSettingsShopNormalized: prepared.savedSettingsShopNormalized,
      statePrefix: prepared.state.slice(0, 8),
    });
    return withOauthStateCookie(
      NextResponse.json({ ok: true, data: { installUrl: prepared.installUrl } }),
      prepared.state
    );
  } catch (error) {
    if (error instanceof ShopifyOauthStatePersistenceError) {
      return errorResponse(error.message, {
        status: 500,
        data: { code: "oauth_state_persist_failed" },
      });
    }

    const message =
      error instanceof Error ? error.message : "Failed to initiate Shopify connection.";
    console.error("[flowcart:shopify:connect:post]", message);
    const status =
      message.includes("valid Shopify store domain") ||
      message.includes("Enter your Shopify store domain")
        ? 400
        : message.includes("Not authenticated")
          ? 401
          : 500;
    return errorResponse(message, { status });
  }
}
