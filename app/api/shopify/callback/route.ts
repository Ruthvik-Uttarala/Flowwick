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
import {
  deleteShopifyOauthState,
  getShopifyOauthState,
} from "@/src/lib/server/shopify-oauth-state";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ShopifyTokenResponse {
  access_token?: string;
  scope?: string;
  error?: string;
  error_description?: string;
}

interface DomainDiagnostics {
  statePrefix: string;
  callbackShopRaw: string;
  callbackShopNormalized: string;
  oauthStateShopRaw: string;
  oauthStateShopNormalized: string;
  savedSettingsShopRaw: string;
  savedSettingsShopNormalized: string;
  tokenExchangeReached: boolean;
  tokenVerificationReached: boolean;
  tokenSaveReached: boolean;
}

function settingsRedirect(
  code?: ShopifyCallbackErrorCode,
  clearStateCookie = true
): NextResponse {
  const targetUrl = code
    ? buildShopifySettingsUrl({ errorCode: code })
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

function logShopifyDomainDiagnostics(
  stage: "failure" | "success",
  reason: string,
  diagnostics: DomainDiagnostics
): void {
  const logger = stage === "failure" ? console.warn : console.info;
  logger("[flowcart:shopify:callback:trace]", {
    stage,
    reason,
    ...diagnostics,
  });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code")?.trim() ?? "";
  const callbackShopRaw = url.searchParams.get("shop")?.trim() ?? "";
  const state = url.searchParams.get("state")?.trim() ?? "";
  const hmac = url.searchParams.get("hmac")?.trim() ?? "";

  if (!code || !callbackShopRaw || !state || !hmac) {
    return settingsRedirect("missing_params");
  }

  let callbackShopNormalized = "";
  try {
    callbackShopNormalized = normalizeShopifyDomain(callbackShopRaw);
  } catch {
    logShopifyDomainDiagnostics("failure", "invalid_callback_shop", {
      statePrefix: state.slice(0, 8),
      callbackShopRaw,
      callbackShopNormalized: "",
      oauthStateShopRaw: "",
      oauthStateShopNormalized: "",
      savedSettingsShopRaw: "",
      savedSettingsShopNormalized: "",
      tokenExchangeReached: false,
      tokenVerificationReached: false,
      tokenSaveReached: false,
    });
    return settingsRedirect("store_domain_mismatch");
  }

  const stateCookie = readCookieValue(request, SHOPIFY_OAUTH_STATE_COOKIE);
  if (stateCookie && stateCookie !== state) {
    return settingsRedirect("invalid_state");
  }

  const storedState = await getShopifyOauthState(state);
  if (!storedState) {
    return settingsRedirect("invalid_state");
  }

  const oauthStateShopNormalized = safeNormalizeShopifyDomain(storedState.shop_domain || "");
  let currentSettings: Awaited<ReturnType<typeof getDbSettings>> | null = null;
  try {
    currentSettings = (await getDbSettings(storedState.user_id)) ?? null;
  } catch {
    currentSettings = null;
  }
  const savedSettingsShopNormalized = safeNormalizeShopifyDomain(
    currentSettings?.shopifyStoreDomain || ""
  );

  const diagnostics: DomainDiagnostics = {
    statePrefix: state.slice(0, 8),
    callbackShopRaw,
    callbackShopNormalized,
    oauthStateShopRaw: storedState.shop_domain ?? "",
    oauthStateShopNormalized,
    savedSettingsShopRaw: currentSettings?.shopifyStoreDomain ?? "",
    savedSettingsShopNormalized,
    tokenExchangeReached: false,
    tokenVerificationReached: false,
    tokenSaveReached: false,
  };

  const finalizeFailure = async (
    errorCode: ShopifyCallbackErrorCode,
    reason: string
  ) => {
    logShopifyDomainDiagnostics("failure", reason, diagnostics);

    try {
      await deleteShopifyOauthState(state);
    } catch {
      // Ignore cleanup failures and return the OAuth error instead.
    }
    return settingsRedirect(errorCode);
  };

  if (new Date(storedState.expires_at).getTime() <= Date.now()) {
    return finalizeFailure("expired_state", "expired_oauth_state");
  }

  if (!oauthStateShopNormalized || callbackShopNormalized !== oauthStateShopNormalized) {
    return finalizeFailure("store_domain_mismatch", "callback_vs_oauth_state");
  }

  if (
    savedSettingsShopNormalized &&
    callbackShopNormalized !== savedSettingsShopNormalized
  ) {
    return finalizeFailure("store_domain_mismatch", "callback_vs_saved_settings");
  }

  const clientId = getShopifyClientId();
  const clientSecret = getShopifyClientSecret();
  if (!clientId || !clientSecret) {
    return finalizeFailure("token_exchange_failed", "missing_server_credentials");
  }

  if (!validateShopifyCallbackHmac(url.searchParams, clientSecret)) {
    return finalizeFailure("invalid_hmac", "invalid_hmac");
  }

  try {
    diagnostics.tokenExchangeReached = true;
    const tokenResponse = await fetch(
      `https://${callbackShopNormalized}/admin/oauth/access_token`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          code,
        }).toString(),
      }
    );

    const tokenData = (await tokenResponse.json().catch(() => null)) as
      | ShopifyTokenResponse
      | null;
    const accessToken = tokenData?.access_token?.trim() ?? "";

    if (!tokenResponse.ok || !accessToken) {
      return finalizeFailure("token_exchange_failed", "token_exchange_failed");
    }

    diagnostics.tokenVerificationReached = true;
    const verified = await verifyShopifyAdminToken({
      shopDomain: callbackShopNormalized,
      adminToken: accessToken,
    });

    if (!verified) {
      return finalizeFailure("token_verification_failed", "token_verification_failed");
    }

    diagnostics.tokenSaveReached = true;
    await saveShopifyAdminToken(storedState.user_id, callbackShopNormalized, accessToken);
    await deleteShopifyOauthState(state);
    logShopifyDomainDiagnostics("success", "callback_completed", diagnostics);
    return settingsRedirect();
  } catch {
    return finalizeFailure("token_exchange_failed", "unexpected_callback_error");
  }
}
