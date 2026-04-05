import { NextResponse } from "next/server";
import { extractUserId } from "@/src/lib/server/auth";
import { errorResponse } from "@/src/lib/server/api-response";
import { getDbSettings, saveDbSettings } from "@/src/lib/server/db-settings";
import {
  SHOPIFY_OAUTH_STATE_COOKIE,
  SHOPIFY_OAUTH_STATE_TTL_SECONDS,
  buildShopifySettingsUrl,
  buildShopifyAuthorizeUrl,
  generateShopifyOauthState,
  getShopifyClientId,
  getShopifyClientSecret,
  isAuthoritativeAppRequest,
} from "@/src/lib/server/shopify";
import {
  SHOPIFY_OAUTH_ERROR_MESSAGES,
  normalizeShopifyDomain,
  safeNormalizeShopifyDomain,
} from "@/src/lib/shopify";
import {
  ShopifyOauthStatePersistenceError,
  saveShopifyOauthState,
} from "@/src/lib/server/shopify-oauth-state";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const userId = await extractUserId(request);
    if (!userId) {
      return errorResponse("Not authenticated.", { status: 401 });
    }

    if (!isAuthoritativeAppRequest(request)) {
      return errorResponse(SHOPIFY_OAUTH_ERROR_MESSAGES.app_url_mismatch, {
        status: 409,
        data: {
          code: "app_url_mismatch",
          productionSettingsUrl: buildShopifySettingsUrl("app_url_mismatch"),
        },
      });
    }

    const body = (await request.json().catch(() => ({}))) as { shopDomain?: string };
    const savedSettings = await getDbSettings(userId);

    const incomingDomain = body.shopDomain?.trim() ?? "";
    let normalizedShopDomain = "";
    try {
      normalizedShopDomain = normalizeShopifyDomain(
        incomingDomain || savedSettings.shopifyStoreDomain
      );
    } catch (error) {
      return errorResponse(
        error instanceof Error ? error.message : "Enter a valid Shopify store domain.",
        { status: 400 }
      );
    }

    if (!normalizedShopDomain) {
      return errorResponse("Enter your Shopify store domain before connecting.", {
        status: 400,
      });
    }

    if (!getShopifyClientId() || !getShopifyClientSecret()) {
      return errorResponse("Shopify OAuth is not configured on the server.", { status: 500 });
    }

    const savedDomain = safeNormalizeShopifyDomain(savedSettings.shopifyStoreDomain || "");
    if (normalizedShopDomain !== savedDomain) {
      await saveDbSettings(userId, { shopifyStoreDomain: normalizedShopDomain });
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

    const installUrl = buildShopifyAuthorizeUrl(normalizedShopDomain, state);
    const response = NextResponse.json({ ok: true, data: { installUrl } });

    response.cookies.set(SHOPIFY_OAUTH_STATE_COOKIE, state, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: SHOPIFY_OAUTH_STATE_TTL_SECONDS,
    });

    return response;
  } catch (error) {
    if (error instanceof ShopifyOauthStatePersistenceError) {
      return errorResponse(error.message, {
        status: 500,
        data: { code: "oauth_state_persist_failed" },
      });
    }

    const message =
      error instanceof Error ? error.message : "Failed to initiate Shopify connection.";
    console.error("[flowcart:shopify:connect]", message);
    return errorResponse(message, { status: 500 });
  }
}
