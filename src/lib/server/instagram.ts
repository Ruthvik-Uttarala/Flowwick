import crypto from "node:crypto";
import {
  INSTAGRAM_OAUTH_ERROR_MESSAGES,
  INSTAGRAM_OAUTH_SCOPE_PARAM,
  type InstagramCallbackErrorCode,
  type InstagramOauthErrorCode,
} from "@/src/lib/instagram";
import {
  getAuthoritativeAppUrl,
  getRequestHost,
  isAuthoritativeAppRequest,
  readCookieValue,
} from "@/src/lib/server/shopify";

export const META_GRAPH_API_VERSION = "v21.0";
export const INSTAGRAM_OAUTH_STATE_COOKIE = "flowcart-instagram-oauth-state";
export const INSTAGRAM_OAUTH_STATE_TTL_SECONDS = 60 * 10;

export interface InstagramConnectErrorData {
  code?: "oauth_state_persist_failed" | "app_url_mismatch";
  productionSettingsUrl?: string;
}

interface MetaApiErrorPayload {
  error?: {
    message?: string;
    code?: number;
    error_subcode?: number;
    type?: string;
  };
}

export interface MetaGraphResponse<T> extends MetaApiErrorPayload {
  data?: T;
}

interface MetaTokenExchangeResponse extends MetaApiErrorPayload {
  access_token?: string;
  token_type?: string;
  expires_in?: number;
}

export function getMetaAppId(): string {
  return process.env.META_APP_ID?.trim() ?? "";
}

export function getMetaAppSecret(): string {
  return process.env.META_APP_SECRET?.trim() ?? "";
}

export function buildInstagramCallbackUrl(): string {
  return `${getAuthoritativeAppUrl()}/api/instagram/callback`;
}

export function buildInstagramSettingsUrl(input?: {
  errorCode?: InstagramOauthErrorCode;
  connected?: boolean;
  selectionRequired?: boolean;
}): string {
  const url = new URL("/settings", getAuthoritativeAppUrl());
  if (input?.errorCode) {
    url.searchParams.set("instagram_error", input.errorCode);
  }
  if (input?.connected) {
    url.searchParams.set("instagram_connected", "true");
  }
  if (input?.selectionRequired) {
    url.searchParams.set("instagram_selection", "required");
  }
  return url.toString();
}

export function buildInstagramAuthorizeUrl(state: string): string {
  const appId = getMetaAppId();
  if (!appId) {
    throw new Error("Meta OAuth is not configured on the server.");
  }

  const url = new URL(`https://www.facebook.com/${META_GRAPH_API_VERSION}/dialog/oauth`);
  url.searchParams.set("client_id", appId);
  url.searchParams.set("redirect_uri", buildInstagramCallbackUrl());
  url.searchParams.set("scope", INSTAGRAM_OAUTH_SCOPE_PARAM);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("state", state);
  return url.toString();
}

export function generateInstagramOauthState(): string {
  return crypto.randomBytes(24).toString("hex");
}

export function getInstagramConnectRedirectUrl(
  input: InstagramConnectErrorData | null | undefined
): string {
  if (input?.code !== "app_url_mismatch") {
    return "";
  }

  const url = input.productionSettingsUrl?.trim() ?? "";
  return /^https?:\/\//i.test(url) ? url : "";
}

export function isMetaCallbackRequestAuthoritative(request: Request): boolean {
  return isAuthoritativeAppRequest(request);
}

export function getMetaCallbackHost(request: Request): string {
  return getRequestHost(request);
}

export function getMetaCallbackStateCookie(request: Request): string {
  return readCookieValue(request, INSTAGRAM_OAUTH_STATE_COOKIE);
}

export function settingsRedirect(
  code?: InstagramCallbackErrorCode,
  options?: { connected?: boolean; selectionRequired?: boolean; clearStateCookie?: boolean }
) {
  const targetUrl = code
    ? buildInstagramSettingsUrl({ errorCode: code })
    : buildInstagramSettingsUrl({
        connected: options?.connected,
        selectionRequired: options?.selectionRequired,
      });

  const response = Response.redirect(targetUrl, 307);
  if (options?.clearStateCookie !== false) {
    response.headers.append(
      "Set-Cookie",
      `${INSTAGRAM_OAUTH_STATE_COOKIE}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0${
        process.env.NODE_ENV === "production" ? "; Secure" : ""
      }`
    );
  }
  return response;
}

export async function fetchMetaJson<T>(input: {
  path: string;
  searchParams?: URLSearchParams;
  init?: RequestInit;
}): Promise<T> {
  const url = new URL(`https://graph.facebook.com/${META_GRAPH_API_VERSION}/${input.path}`);
  if (input.searchParams) {
    url.search = input.searchParams.toString();
  }

  const response = await fetch(url, input.init);
  const payload = (await response.json().catch(() => null)) as (T & MetaApiErrorPayload) | null;

  if (!response.ok) {
    const message =
      payload?.error?.message ??
      INSTAGRAM_OAUTH_ERROR_MESSAGES.account_discovery_failed;
    throw new Error(message);
  }

  if (!payload) {
    throw new Error("Meta Graph response did not include a JSON body.");
  }

  return payload;
}

async function exchangeMetaToken(searchParams: URLSearchParams): Promise<MetaTokenExchangeResponse> {
  const url = new URL(`https://graph.facebook.com/${META_GRAPH_API_VERSION}/oauth/access_token`);
  url.search = searchParams.toString();

  const response = await fetch(url);
  const payload = (await response.json().catch(() => null)) as MetaTokenExchangeResponse | null;

  if (!response.ok || !payload?.access_token?.trim()) {
    throw new Error(
      payload?.error?.message ?? INSTAGRAM_OAUTH_ERROR_MESSAGES.token_exchange_failed
    );
  }

  return payload;
}

export async function exchangeInstagramCodeForLongLivedUserToken(code: string): Promise<{
  shortLivedUserToken: string;
  longLivedUserToken: string;
  expiresIn: number;
}> {
  const appId = getMetaAppId();
  const appSecret = getMetaAppSecret();
  if (!appId || !appSecret) {
    throw new Error("Meta OAuth is not configured on the server.");
  }

  const shortLived = await exchangeMetaToken(
    new URLSearchParams({
      client_id: appId,
      client_secret: appSecret,
      redirect_uri: buildInstagramCallbackUrl(),
      code: code.trim(),
    })
  );

  const shortLivedUserToken = shortLived.access_token?.trim() ?? "";
  if (!shortLivedUserToken) {
    throw new Error(INSTAGRAM_OAUTH_ERROR_MESSAGES.token_exchange_failed);
  }

  const longLived = await exchangeMetaToken(
    new URLSearchParams({
      grant_type: "fb_exchange_token",
      client_id: appId,
      client_secret: appSecret,
      fb_exchange_token: shortLivedUserToken,
    })
  );

  return {
    shortLivedUserToken,
    longLivedUserToken: longLived.access_token?.trim() ?? "",
    expiresIn: Number(longLived.expires_in ?? 0),
  };
}
