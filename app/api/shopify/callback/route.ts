import { NextResponse } from "next/server";
import { getDbSettings, saveShopifyAdminToken } from "@/src/lib/server/db-settings";
import {
  SHOPIFY_OAUTH_STATE_COOKIE,
  buildShopifySettingsUrl,
  getShopifyClientId,
  getShopifyClientSecret,
  readCookieValue,
  validateShopifyCallbackHmac,
  verifyShopifyAdminToken,
} from "@/src/lib/server/shopify";
import {
  normalizeShopifyDomain,
  safeNormalizeShopifyDomain,
  type ShopifyCallbackErrorCode,
} from "@/src/lib/shopify";
import { deleteShopifyOauthState, getShopifyOauthState } from "@/src/lib/server/shopify-oauth-state";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ShopifyTokenResponse {
  access_token?: string;
  scope?: string;
  error?: string;
  error_description?: string;
}

function settingsRedirect(
  code?: ShopifyCallbackErrorCode,
  clearStateCookie = true
): NextResponse {
  const targetUrl = code
    ? buildShopifySettingsUrl(code)
    : `${buildShopifySettingsUrl()}?shopify_connected=true`;
  const response = NextResponse.redirect(new URL(targetUrl));
  if (clearStateCookie) {
    response.cookies.set(SHOPIFY_OAUTH_STATE_COOKIE, "", {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 0,
    });
  }
  return response;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code")?.trim() ?? "";
  const shop = url.searchParams.get("shop")?.trim() ?? "";
  const state = url.searchParams.get("state")?.trim() ?? "";
  const hmac = url.searchParams.get("hmac")?.trim() ?? "";

  if (!code || !shop || !state || !hmac) {
    return settingsRedirect("missing_params");
  }

  let normalizedShop: string;
  try {
    normalizedShop = normalizeShopifyDomain(shop);
  } catch {
    return settingsRedirect("store_domain_mismatch");
  }

  const stateCookie = readCookieValue(request, SHOPIFY_OAUTH_STATE_COOKIE);
  if (!stateCookie || stateCookie !== state) {
    return settingsRedirect("invalid_state");
  }

  const storedState = await getShopifyOauthState(state);
  if (!storedState) {
    return settingsRedirect("invalid_state");
  }

  const finalizeFailure = async (errorCode: ShopifyCallbackErrorCode) => {
    try {
      await deleteShopifyOauthState(state);
    } catch {
      // Ignore cleanup failures and return the OAuth error instead.
    }
    return settingsRedirect(errorCode);
  };

  if (new Date(storedState.expires_at).getTime() <= Date.now()) {
    return finalizeFailure("expired_state");
  }

  if (normalizedShop !== storedState.shop_domain) {
    return finalizeFailure("store_domain_mismatch");
  }

  const clientId = getShopifyClientId();
  const clientSecret = getShopifyClientSecret();
  if (!clientId || !clientSecret) {
    return finalizeFailure("token_exchange_failed");
  }

  if (!validateShopifyCallbackHmac(url.searchParams, clientSecret)) {
    return finalizeFailure("invalid_hmac");
  }

  const currentSettings = await getDbSettings(storedState.user_id);
  if (safeNormalizeShopifyDomain(currentSettings.shopifyStoreDomain || "") !== storedState.shop_domain) {
    return finalizeFailure("store_domain_mismatch");
  }

  try {
    const tokenResponse = await fetch(`https://${normalizedShop}/admin/oauth/access_token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
      }).toString(),
    });

    const tokenData = (await tokenResponse.json().catch(() => null)) as ShopifyTokenResponse | null;
    const accessToken = tokenData?.access_token?.trim() ?? "";

    if (!tokenResponse.ok || !accessToken) {
      return finalizeFailure("token_exchange_failed");
    }

    const verified = await verifyShopifyAdminToken({
      shopDomain: normalizedShop,
      adminToken: accessToken,
    });

    if (!verified) {
      return finalizeFailure("token_verification_failed");
    }

    await saveShopifyAdminToken(storedState.user_id, normalizedShop, accessToken);
    await deleteShopifyOauthState(state);
    return settingsRedirect();
  } catch {
    return finalizeFailure("token_exchange_failed");
  }
}
