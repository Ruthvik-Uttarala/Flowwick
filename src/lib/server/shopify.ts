import crypto from "node:crypto";
import {
  SHOPIFY_OAUTH_ERROR_MESSAGES,
  SHOPIFY_STANDALONE_CONNECT_PARAM,
  SHOPIFY_STANDALONE_CONNECT_SHOP_PARAM,
  type ShopifyOauthErrorCode,
  SHOPIFY_OAUTH_SCOPE_PARAM,
  normalizeShopifyDomain,
} from "@/src/lib/shopify";

export const SHOPIFY_ADMIN_API_VERSION = "2026-04";
export const SHOPIFY_OAUTH_STATE_COOKIE = "flowcart-shopify-oauth-state";
export const SHOPIFY_OAUTH_STATE_TTL_SECONDS = 60 * 10;

interface ShopifyGraphQLError {
  message?: string;
}

interface ShopifyGraphQLResponse<T> {
  data?: T;
  errors?: ShopifyGraphQLError[];
}

export function getShopifyClientId(): string {
  return process.env.SHOPIFY_CLIENT_ID?.trim() ?? "";
}

export function getShopifyClientSecret(): string {
  return process.env.SHOPIFY_CLIENT_SECRET?.trim() ?? "";
}

export function getAuthoritativeAppUrl(): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim() || "http://localhost:3000";
  return appUrl.replace(/\/$/, "");
}

/**
 * FlowCart runs Shopify OAuth only as a standalone SaaS app on NEXT_PUBLIC_APP_URL.
 * It is not implemented as an embedded Shopify admin app.
 */
export function buildShopifyCallbackUrl(): string {
  return `${getAuthoritativeAppUrl()}/api/shopify/callback`;
}

export function buildShopifySettingsUrl(input?: {
  errorCode?: ShopifyOauthErrorCode;
  shopDomain?: string;
  autostartConnect?: boolean;
}): string {
  const redirectUrl = new URL("/settings", getAuthoritativeAppUrl());
  if (input?.errorCode) {
    redirectUrl.searchParams.set("shopify_error", input.errorCode);
  }
  if (input?.autostartConnect) {
    redirectUrl.searchParams.set(SHOPIFY_STANDALONE_CONNECT_PARAM, "1");
  }
  if (input?.shopDomain) {
    redirectUrl.searchParams.set(SHOPIFY_STANDALONE_CONNECT_SHOP_PARAM, input.shopDomain);
  }
  return redirectUrl.toString();
}

export function getRequestHost(request: Request): string {
  const forwardedHost = request.headers.get("x-forwarded-host")?.trim();
  if (forwardedHost) {
    return forwardedHost.split(",")[0]?.trim().toLowerCase() ?? "";
  }

  const host = request.headers.get("host")?.trim();
  if (host) {
    return host.toLowerCase();
  }

  return new URL(request.url).host.toLowerCase();
}

export function isAuthoritativeAppRequest(request: Request): boolean {
  const requestHost = getRequestHost(request);
  const authoritativeHost = new URL(getAuthoritativeAppUrl()).host.toLowerCase();
  return requestHost === authoritativeHost;
}

function refererIsShopifyAdmin(request: Request): boolean {
  const referer = request.headers.get("referer")?.trim().toLowerCase() ?? "";
  return referer.includes("admin.shopify.com") || referer.includes(".myshopify.com/admin");
}

export function isUnsupportedShopifyAdminContext(request: Request): boolean {
  const url = new URL(request.url);
  const embedded = url.searchParams.get("embedded")?.trim() === "1";
  const hostParamPresent = Boolean(url.searchParams.get("host")?.trim());
  const fetchDest = request.headers.get("sec-fetch-dest")?.trim().toLowerCase() ?? "";
  const iframeRequest = fetchDest === "iframe";

  return embedded || hostParamPresent || iframeRequest || refererIsShopifyAdmin(request);
}

export function buildStandaloneShopifyConnectUrl(shopDomain: string): string {
  const url = new URL("/api/shopify/connect", getAuthoritativeAppUrl());
  if (shopDomain.trim()) {
    url.searchParams.set(SHOPIFY_STANDALONE_CONNECT_SHOP_PARAM, shopDomain.trim());
  }
  return url.toString();
}

export function buildShopifyIframeEscapePage(targetUrl: string, message: string): string {
  const safeTarget = JSON.stringify(targetUrl);
  const safeMessage = JSON.stringify(message);
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Redirecting to FlowCart</title>
  </head>
  <body>
    <p id="message"></p>
    <script>
      const target = ${safeTarget};
      const message = ${safeMessage};
      document.getElementById("message").textContent = message;
      if (window.top && window.top !== window.self) {
        window.top.location.href = target;
      } else {
        window.location.href = target;
      }
    </script>
    <noscript>
      <p><a href="${targetUrl}">Continue to FlowCart</a></p>
    </noscript>
  </body>
</html>`;
}

export function generateShopifyOauthState(): string {
  return crypto.randomBytes(24).toString("hex");
}

export function buildShopifyAuthorizeUrl(shopDomain: string, state: string): string {
  const clientId = getShopifyClientId();
  if (!clientId) {
    throw new Error("Shopify OAuth is not configured on the server.");
  }

  const shop = normalizeShopifyDomain(shopDomain);
  const url = new URL(`https://${shop}/admin/oauth/authorize`);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("scope", SHOPIFY_OAUTH_SCOPE_PARAM);
  url.searchParams.set("redirect_uri", buildShopifyCallbackUrl());
  url.searchParams.set("state", state);
  return url.toString();
}

export function readCookieValue(request: Request, name: string): string {
  const cookieHeader = request.headers.get("cookie") ?? "";
  const match = cookieHeader.match(new RegExp(`(?:^|; )${name}=([^;]+)`));
  return match ? decodeURIComponent(match[1] ?? "") : "";
}

export function validateShopifyCallbackHmac(
  searchParams: URLSearchParams,
  clientSecret: string
): boolean {
  const providedHmac = searchParams.get("hmac")?.trim() ?? "";
  if (!providedHmac || !clientSecret) return false;

  const pieces: string[] = [];
  const groupedValues = new Map<string, string[]>();

  for (const [key, value] of searchParams.entries()) {
    if (key === "hmac" || key === "signature") continue;
    const bucket = groupedValues.get(key) ?? [];
    bucket.push(value);
    groupedValues.set(key, bucket);
  }

  for (const key of [...groupedValues.keys()].sort()) {
    pieces.push(`${key}=${groupedValues.get(key)?.join(",") ?? ""}`);
  }

  const digest = crypto
    .createHmac("sha256", clientSecret)
    .update(pieces.join("&"))
    .digest("hex");

  const left = Buffer.from(digest, "utf8");
  const right = Buffer.from(providedHmac, "utf8");
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

export async function fetchShopifyAdminGraphQL<T>(input: {
  shopDomain: string;
  adminToken: string;
  query: string;
  variables?: Record<string, unknown>;
}): Promise<T> {
  const shop = normalizeShopifyDomain(input.shopDomain);
  const token = input.adminToken.trim();
  if (!shop || !token) {
    throw new Error("Shopify store domain or admin token is missing.");
  }

  const endpoint = `https://${shop}/admin/api/${SHOPIFY_ADMIN_API_VERSION}/graphql.json`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": token,
    },
    body: JSON.stringify({
      query: input.query,
      variables: input.variables ?? {},
    }),
  });

  const payload = (await response.json().catch(() => null)) as ShopifyGraphQLResponse<T> | null;
  if (!response.ok) {
    const message =
      payload?.errors?.[0]?.message ??
      `Shopify request failed with status ${response.status}.`;
    throw new Error(message);
  }

  if (Array.isArray(payload?.errors) && payload.errors.length > 0) {
    throw new Error(payload.errors[0]?.message ?? "Shopify GraphQL request failed.");
  }

  if (!payload?.data) {
    throw new Error("Shopify GraphQL response did not include data.");
  }

  return payload.data;
}

export async function verifyShopifyAdminToken(input: {
  shopDomain: string;
  adminToken: string;
}): Promise<boolean> {
  try {
    const data = await fetchShopifyAdminGraphQL<{ shop?: { id?: string; name?: string } }>({
      shopDomain: input.shopDomain,
      adminToken: input.adminToken,
      query: `query VerifyShopToken { shop { id name } }`,
    });

    return Boolean(data.shop?.id && data.shop?.name);
  } catch {
    return false;
  }
}

export function mapShopifyCallbackError(code: string): string {
  return (
    SHOPIFY_OAUTH_ERROR_MESSAGES[
      code as keyof typeof SHOPIFY_OAUTH_ERROR_MESSAGES
    ] ?? "Shopify OAuth failed with an unknown error."
  );
}
