import {
  ConnectionSettings,
  InstagramCandidateAccount,
  InstagramConnectionSource,
  InstagramConnectionStatus,
  InstagramConnectionSummary,
} from "@/src/lib/types";
import { getInstagramStatusLabel } from "@/src/lib/instagram";

function parseBooleanEnv(value: string | undefined, defaultValue = false): boolean {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return defaultValue;
  return ["1", "true", "yes", "on"].includes(normalized);
}

function isInstagramEnabledForSummary(): boolean {
  return parseBooleanEnv(process.env.INSTAGRAM_ENABLED, true);
}

export function sanitizeCandidateAccounts(
  accounts: InstagramCandidateAccount[] | undefined
): InstagramCandidateAccount[] {
  if (!Array.isArray(accounts)) return [];
  return accounts.flatMap((candidate) => {
    const pageId = candidate.pageId?.trim() ?? "";
    const pageName = candidate.pageName?.trim() ?? "";
    const instagramBusinessAccountId =
      candidate.instagramBusinessAccountId?.trim() ?? "";
    if (!pageId || !instagramBusinessAccountId) return [];
    return [{ pageId, pageName, instagramBusinessAccountId }];
  });
}

function buildConnectionSummary(
  input: Partial<InstagramConnectionSummary> & { enabled?: boolean }
): InstagramConnectionSummary {
  const status = (input.status ?? "disconnected") as InstagramConnectionStatus;
  const enabled = input.enabled ?? true;

  return {
    enabled,
    status,
    statusLabel: getInstagramStatusLabel(status),
    source: (input.source ?? "none") as InstagramConnectionSource,
    selectedPageId: input.selectedPageId?.trim() ?? "",
    selectedPageName: input.selectedPageName?.trim() ?? "",
    selectedInstagramBusinessAccountId:
      input.selectedInstagramBusinessAccountId?.trim() ?? "",
    hasLongLivedUserToken: Boolean(input.hasLongLivedUserToken),
    hasPublishCredential: Boolean(input.hasPublishCredential),
    canPublish: Boolean(input.canPublish),
    needsReconnect: Boolean(input.needsReconnect),
    errorCode: input.errorCode?.trim() ?? "",
    lastValidatedAt: input.lastValidatedAt?.trim() ?? "",
    tokenExpiresAt: input.tokenExpiresAt?.trim() ?? "",
    candidates: sanitizeCandidateAccounts(input.candidates),
  };
}

function buildOauthSummary(settings: ConnectionSettings): InstagramConnectionSummary {
  const candidates = sanitizeCandidateAccounts(settings.instagramCandidateAccounts);
  const hasUserToken = Boolean(settings.instagramUserAccessToken?.trim());
  const hasPublishCredential = Boolean(settings.instagramAccessToken.trim());
  const selectedPageId = settings.instagramPageId?.trim() ?? "";
  const selectedPageName = settings.instagramPageName?.trim() ?? "";
  const selectedInstagramBusinessAccountId = settings.instagramBusinessAccountId.trim();
  const storedStatus = settings.instagramConnectionStatus ?? "disconnected";

  if (candidates.length > 1 && !selectedPageId) {
    return buildConnectionSummary({
      enabled: isInstagramEnabledForSummary(),
      status: "selection_required",
      source: "none",
      selectedPageId,
      selectedPageName,
      selectedInstagramBusinessAccountId,
      hasLongLivedUserToken: hasUserToken,
      hasPublishCredential,
      canPublish: false,
      needsReconnect: false,
      errorCode: settings.instagramConnectionErrorCode ?? "",
      lastValidatedAt: settings.instagramLastValidatedAt ?? "",
      tokenExpiresAt: settings.instagramTokenExpiresAt ?? "",
      candidates,
    });
  }

  const source: InstagramConnectionSource =
    hasPublishCredential && hasUserToken ? "oauth_cached_page_token" : "none";

  const status =
    storedStatus === "disconnected" && hasPublishCredential && hasUserToken
      ? "connected"
      : storedStatus;

  const canPublish =
    (status === "connected" || status === "legacy_fallback") &&
    hasPublishCredential &&
    selectedInstagramBusinessAccountId.length > 0;

  return buildConnectionSummary({
    enabled: isInstagramEnabledForSummary(),
    status,
    source,
    selectedPageId,
    selectedPageName,
    selectedInstagramBusinessAccountId,
    hasLongLivedUserToken: hasUserToken,
    hasPublishCredential,
    canPublish,
    needsReconnect: status === "needs_reconnect" || status === "invalid_expired_token",
    errorCode: settings.instagramConnectionErrorCode ?? "",
    lastValidatedAt: settings.instagramLastValidatedAt ?? "",
    tokenExpiresAt: settings.instagramTokenExpiresAt ?? "",
    candidates,
  });
}

export function getStoredInstagramConnectionSummary(
  settings: ConnectionSettings
): InstagramConnectionSummary {
  const enabled = isInstagramEnabledForSummary();
  const userToken = settings.instagramUserAccessToken?.trim() ?? "";
  const publishToken = settings.instagramAccessToken.trim();
  const businessAccountId = settings.instagramBusinessAccountId.trim();

  if (!enabled) {
    return buildConnectionSummary({
      enabled,
      status: "disconnected",
    });
  }

  if (!userToken && publishToken && businessAccountId) {
    return buildConnectionSummary({
      enabled,
      status: "legacy_fallback",
      source: "legacy_fallback",
      selectedInstagramBusinessAccountId: businessAccountId,
      hasLongLivedUserToken: false,
      hasPublishCredential: true,
      canPublish: true,
      needsReconnect: false,
      errorCode: settings.instagramConnectionErrorCode ?? "",
      lastValidatedAt: settings.instagramLastValidatedAt ?? "",
      tokenExpiresAt: settings.instagramTokenExpiresAt ?? "",
    });
  }

  if (!userToken && !publishToken && !businessAccountId) {
    return buildConnectionSummary({
      enabled,
      status: "disconnected",
      errorCode: settings.instagramConnectionErrorCode ?? "",
    });
  }

  return buildOauthSummary(settings);
}
