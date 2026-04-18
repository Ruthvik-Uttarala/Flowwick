import {
  InstagramConnectionStatus,
  InstagramConnectionSummary,
} from "@/src/lib/types";

export const INSTAGRAM_OAUTH_SCOPES = [
  "pages_show_list",
  "pages_read_engagement",
  "instagram_basic",
  "instagram_content_publish",
] as const;

export const INSTAGRAM_OAUTH_SCOPE_PARAM = INSTAGRAM_OAUTH_SCOPES.join(",");
export const INSTAGRAM_STANDALONE_CONNECT_PARAM = "instagram_connect";

export const INSTAGRAM_OAUTH_ERROR_MESSAGES = {
  missing_params: "Instagram connection failed because the callback was incomplete.",
  invalid_state: "Instagram connection failed because the request state was invalid.",
  expired_state: "Instagram connection failed because the authorization session expired.",
  token_exchange_failed:
    "Instagram connection failed while exchanging the authorization code.",
  account_discovery_failed:
    "Instagram connection failed while discovering the connected Page and Instagram account.",
  no_eligible_account:
    "No eligible Facebook Page with a linked Instagram Business or Creator account was found.",
  missing_page_linkage:
    "No eligible Facebook Page with a linked Instagram Business or Creator account was found.",
  missing_instagram_business_account:
    "The selected Facebook Page is not currently linked to an Instagram Business or Creator account.",
  missing_page_access_token:
    "Instagram connection needs to be reconnected because FlowCart could not obtain a Page publishing token.",
  invalid_selection:
    "The selected Instagram account is no longer available. Please reconnect and try again.",
  oauth_state_persist_failed:
    "Instagram connection could not be started. Please refresh and try again.",
  app_url_mismatch:
    "Instagram OAuth must be started from the production FlowCart URL. You are being redirected there now.",
} as const;

export type InstagramOauthErrorCode = keyof typeof INSTAGRAM_OAUTH_ERROR_MESSAGES;
export type InstagramCallbackErrorCode = Extract<
  InstagramOauthErrorCode,
  | "missing_params"
  | "invalid_state"
  | "expired_state"
  | "token_exchange_failed"
  | "account_discovery_failed"
  | "missing_page_linkage"
  | "missing_instagram_business_account"
  | "missing_page_access_token"
  | "no_eligible_account"
  | "invalid_selection"
>;
export type InstagramConnectErrorCode = Extract<
  InstagramOauthErrorCode,
  "oauth_state_persist_failed" | "app_url_mismatch"
>;

export function mapInstagramOauthError(code: string): string {
  return (
    INSTAGRAM_OAUTH_ERROR_MESSAGES[
      code as keyof typeof INSTAGRAM_OAUTH_ERROR_MESSAGES
    ] ?? "Instagram connection failed with an unknown error."
  );
}

export function getInstagramStatusLabel(status: InstagramConnectionStatus): string {
  switch (status) {
    case "connected":
      return "Connected";
    case "legacy_fallback":
      return "Connected";
    case "needs_reconnect":
      return "Needs reconnect";
    case "invalid_expired_token":
      return "Invalid / expired token";
    case "missing_page_linkage":
      return "Missing page linkage";
    case "missing_instagram_business_account":
      return "Missing Instagram business account";
    case "selection_required":
      return "Choose account";
    default:
      return "Disconnected";
  }
}

export function isInstagramDebugFieldModeEnabled(): boolean {
  const value = process.env.FLOWCART_ENABLE_INSTAGRAM_DEBUG_FIELDS?.trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes" || value === "on";
}

export function isInstagramConnectionReady(
  connection: Pick<InstagramConnectionSummary, "enabled" | "canPublish">
): boolean {
  return !connection.enabled || connection.canPublish;
}
