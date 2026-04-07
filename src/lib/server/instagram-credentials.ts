import {
  ActiveInstagramCredentials,
  ConnectionSettings,
  InstagramCandidateAccount,
  InstagramConnectionSummary,
} from "@/src/lib/types";
import {
  clearInstagramConnectionState,
  getDbSettings,
  saveInstagramConnectionState,
} from "@/src/lib/server/db-settings";
import {
  decryptInstagramToken,
  encryptInstagramToken,
  hasInstagramTokenEncryptionConfigured,
  isEncryptedInstagramToken,
} from "@/src/lib/server/instagram-crypto";
import { fetchMetaJson } from "@/src/lib/server/instagram";
import {
  getStoredInstagramConnectionSummary,
  sanitizeCandidateAccounts,
} from "@/src/lib/server/instagram-connection-summary";

interface MetaManagedPage {
  id?: string;
  name?: string;
  access_token?: string;
  instagram_business_account?: {
    id?: string;
  };
}

interface MetaManagedPagesResponse {
  data?: MetaManagedPage[];
}

async function fetchManagedPages(longLivedUserToken: string): Promise<MetaManagedPage[]> {
  const response = await fetchMetaJson<MetaManagedPagesResponse>({
    path: "me/accounts",
    searchParams: new URLSearchParams({
      fields: "name,access_token,instagram_business_account",
      access_token: longLivedUserToken,
    }),
  });

  return Array.isArray(response.data) ? response.data : [];
}

function pagesToCandidates(pages: MetaManagedPage[]): InstagramCandidateAccount[] {
  return pages.flatMap((page) => {
    const pageId = page.id?.trim() ?? "";
    const instagramBusinessAccountId = page.instagram_business_account?.id?.trim() ?? "";

    if (!pageId || !instagramBusinessAccountId) {
      return [];
    }

    return [
      {
        pageId,
        pageName: page.name?.trim() ?? "",
        instagramBusinessAccountId,
      },
    ];
  });
}

function buildOauthCredentials(
  input: Omit<ActiveInstagramCredentials, "status">
): ActiveInstagramCredentials {
  return {
    status: "connected",
    ...input,
  };
}

async function persistConnectedPageSelection(input: {
  userId: string;
  longLivedUserToken: string;
  pageId: string;
  pageName: string;
  pageAccessToken: string;
  instagramBusinessAccountId: string;
  tokenExpiresAt?: string;
}): Promise<InstagramConnectionSummary> {
  const saved = await saveInstagramConnectionState(input.userId, {
    instagramUserAccessToken: encryptInstagramToken(input.longLivedUserToken),
    instagramAccessToken: encryptInstagramToken(input.pageAccessToken),
    instagramBusinessAccountId: input.instagramBusinessAccountId,
    instagramPageId: input.pageId,
    instagramPageName: input.pageName,
    instagramConnectionStatus: "connected",
    instagramConnectionErrorCode: "",
    instagramLastValidatedAt: new Date().toISOString(),
    instagramTokenExpiresAt: input.tokenExpiresAt ?? "",
    instagramCandidateAccounts: [],
  });

  return getStoredInstagramConnectionSummary(saved);
}

async function markInstagramConnectionState(
  userId: string,
  patch: Parameters<typeof saveInstagramConnectionState>[1]
): Promise<InstagramConnectionSummary> {
  const saved = await saveInstagramConnectionState(userId, patch);
  return getStoredInstagramConnectionSummary(saved);
}

export async function completeInstagramOauthConnection(input: {
  userId: string;
  longLivedUserToken: string;
  tokenExpiresAt?: string;
}): Promise<{
  connection: InstagramConnectionSummary;
  selectionRequired: boolean;
}> {
  const pages = await fetchManagedPages(input.longLivedUserToken);
  const candidates = pagesToCandidates(pages);

  if (candidates.length === 0) {
    return {
      connection: await markInstagramConnectionState(input.userId, {
        instagramUserAccessToken: encryptInstagramToken(input.longLivedUserToken),
        instagramAccessToken: "",
        instagramBusinessAccountId: "",
        instagramPageId: "",
        instagramPageName: "",
        instagramConnectionStatus: "missing_page_linkage",
        instagramConnectionErrorCode: "missing_page_linkage",
        instagramLastValidatedAt: "",
        instagramTokenExpiresAt: input.tokenExpiresAt ?? "",
        instagramCandidateAccounts: [],
      }),
      selectionRequired: false,
    };
  }

  if (candidates.length > 1) {
    return {
      connection: await markInstagramConnectionState(input.userId, {
        instagramUserAccessToken: encryptInstagramToken(input.longLivedUserToken),
        instagramAccessToken: "",
        instagramBusinessAccountId: "",
        instagramPageId: "",
        instagramPageName: "",
        instagramConnectionStatus: "selection_required",
        instagramConnectionErrorCode: "",
        instagramLastValidatedAt: "",
        instagramTokenExpiresAt: input.tokenExpiresAt ?? "",
        instagramCandidateAccounts: candidates,
      }),
      selectionRequired: true,
    };
  }

  const candidate = candidates[0];
  const selectedPage = pages.find((page) => (page.id?.trim() ?? "") === candidate.pageId);
  const pageAccessToken = selectedPage?.access_token?.trim() ?? "";

  if (!pageAccessToken) {
    return {
      connection: await markInstagramConnectionState(input.userId, {
        instagramUserAccessToken: encryptInstagramToken(input.longLivedUserToken),
        instagramAccessToken: "",
        instagramBusinessAccountId: "",
        instagramPageId: "",
        instagramPageName: "",
        instagramConnectionStatus: "needs_reconnect",
        instagramConnectionErrorCode: "missing_page_access_token",
        instagramLastValidatedAt: "",
        instagramTokenExpiresAt: input.tokenExpiresAt ?? "",
        instagramCandidateAccounts: [],
      }),
      selectionRequired: false,
    };
  }

  return {
    connection: await persistConnectedPageSelection({
      userId: input.userId,
      longLivedUserToken: input.longLivedUserToken,
      pageId: candidate.pageId,
      pageName: candidate.pageName,
      pageAccessToken,
      instagramBusinessAccountId: candidate.instagramBusinessAccountId,
      tokenExpiresAt: input.tokenExpiresAt ?? "",
    }),
    selectionRequired: false,
  };
}

export async function getInstagramConnection(
  userId: string
): Promise<InstagramConnectionSummary> {
  const settings = await getDbSettings(userId);
  return getStoredInstagramConnectionSummary(settings);
}

export async function getActiveInstagramCredentials(
  userId: string
): Promise<ActiveInstagramCredentials | null> {
  const settings = await getDbSettings(userId);
  const summary = getStoredInstagramConnectionSummary(settings);

  if (
    !summary.enabled ||
    (summary.status !== "connected" && summary.status !== "legacy_fallback")
  ) {
    return null;
  }

  if (summary.status === "legacy_fallback") {
    return {
      status: "legacy_fallback",
      source: "legacy_fallback",
      pageId: "",
      pageName: "",
      instagramBusinessAccountId: summary.selectedInstagramBusinessAccountId,
      publishAccessToken: settings.instagramAccessToken.trim(),
      hasLongLivedUserToken: false,
    };
  }

  if (!summary.selectedPageId || !summary.selectedInstagramBusinessAccountId) {
    return null;
  }

  const cachedPublishToken = settings.instagramAccessToken.trim();
  if (cachedPublishToken) {
    try {
      return buildOauthCredentials({
        source: "oauth_cached_page_token",
        pageId: summary.selectedPageId,
        pageName: summary.selectedPageName,
        instagramBusinessAccountId: summary.selectedInstagramBusinessAccountId,
        publishAccessToken: decryptInstagramToken(cachedPublishToken),
        hasLongLivedUserToken: summary.hasLongLivedUserToken,
      });
    } catch (error) {
      console.warn("[flowcart:instagram:resolver]", {
        stage: "decrypt_cached_page_token_failed",
        userIdPrefix: userId.slice(0, 8),
        pageId: summary.selectedPageId,
        hasUserToken: summary.hasLongLivedUserToken,
        reason: error instanceof Error ? error.message : "unknown",
      });
    }
  }

  const encryptedUserToken = settings.instagramUserAccessToken?.trim() ?? "";
  if (!encryptedUserToken) {
    return null;
  }

  let longLivedUserToken = "";
  try {
    longLivedUserToken = decryptInstagramToken(encryptedUserToken);
  } catch (error) {
    console.warn("[flowcart:instagram:resolver]", {
      stage: "decrypt_long_lived_user_token_failed",
      userIdPrefix: userId.slice(0, 8),
      pageId: summary.selectedPageId,
      hasCachedPublishToken: Boolean(cachedPublishToken),
      reason: error instanceof Error ? error.message : "unknown",
    });
    return null;
  }

  try {
    const pages = await fetchManagedPages(longLivedUserToken);
    const selectedPage = pages.find((page) => (page.id?.trim() ?? "") === summary.selectedPageId);
    const pageAccessToken = selectedPage?.access_token?.trim() ?? "";
    const businessAccountId =
      selectedPage?.instagram_business_account?.id?.trim() ?? "";

    if (!selectedPage) {
      await markInstagramConnectionState(userId, {
        instagramConnectionStatus: "missing_page_linkage",
        instagramConnectionErrorCode: "missing_page_linkage",
        instagramAccessToken: "",
      });
      return null;
    }

    if (!businessAccountId) {
      await markInstagramConnectionState(userId, {
        instagramConnectionStatus: "missing_instagram_business_account",
        instagramConnectionErrorCode: "missing_instagram_business_account",
        instagramAccessToken: "",
      });
      return null;
    }

    if (!pageAccessToken) {
      await markInstagramConnectionState(userId, {
        instagramConnectionStatus: "needs_reconnect",
        instagramConnectionErrorCode: "missing_page_access_token",
        instagramAccessToken: "",
      });
      return null;
    }

    await saveInstagramConnectionState(userId, {
      instagramAccessToken: encryptInstagramToken(pageAccessToken),
      instagramBusinessAccountId: businessAccountId,
      instagramPageName: selectedPage.name?.trim() ?? summary.selectedPageName,
      instagramConnectionStatus: "connected",
      instagramConnectionErrorCode: "",
      instagramLastValidatedAt: new Date().toISOString(),
    });

    return buildOauthCredentials({
      source: "oauth_derived_page_token",
      pageId: summary.selectedPageId,
      pageName: selectedPage.name?.trim() ?? summary.selectedPageName,
      instagramBusinessAccountId: businessAccountId,
      publishAccessToken: pageAccessToken,
      hasLongLivedUserToken: true,
    });
  } catch (error) {
    console.warn("[flowcart:instagram:resolver]", {
      stage: "resolve_active_credentials_failed",
      userIdPrefix: userId.slice(0, 8),
      pageId: summary.selectedPageId,
      hasCachedPublishToken: Boolean(cachedPublishToken),
      reason: error instanceof Error ? error.message : "unknown",
    });
    await markInstagramConnectionState(userId, {
      instagramConnectionStatus: "invalid_expired_token",
      instagramConnectionErrorCode: "invalid_expired_token",
    });
    return null;
  }
}

export async function validateInstagramConnection(
  userId: string
): Promise<InstagramConnectionSummary> {
  const settings = await getDbSettings(userId);
  const summary = getStoredInstagramConnectionSummary(settings);

  if (!summary.enabled) {
    return summary;
  }

  if (summary.status === "disconnected") {
    return summary;
  }

  if (summary.status === "legacy_fallback") {
    return markInstagramConnectionState(userId, {
      instagramConnectionStatus: "legacy_fallback",
      instagramConnectionErrorCode: "",
      instagramLastValidatedAt: new Date().toISOString(),
    });
  }

  const encryptedUserToken = settings.instagramUserAccessToken?.trim() ?? "";
  if (!encryptedUserToken) {
    return markInstagramConnectionState(userId, {
      instagramConnectionStatus: "needs_reconnect",
      instagramConnectionErrorCode: "missing_user_token",
    });
  }

  let longLivedUserToken = "";
  try {
    longLivedUserToken = decryptInstagramToken(encryptedUserToken);
  } catch (error) {
    console.warn("[flowcart:instagram:validate]", {
      stage: "decrypt_user_token_failed",
      userIdPrefix: userId.slice(0, 8),
      hasPublishToken: summary.hasPublishCredential,
      reason: error instanceof Error ? error.message : "unknown",
    });
    return markInstagramConnectionState(userId, {
      instagramConnectionStatus: "invalid_expired_token",
      instagramConnectionErrorCode: "invalid_expired_token",
    });
  }

  try {
    const pages = await fetchManagedPages(longLivedUserToken);
    const candidates = pagesToCandidates(pages);

    if (!pages.length) {
      return markInstagramConnectionState(userId, {
        instagramConnectionStatus: "missing_page_linkage",
        instagramConnectionErrorCode: "missing_page_linkage",
        instagramAccessToken: "",
        instagramCandidateAccounts: [],
      });
    }

    if (candidates.length > 1 && !summary.selectedPageId) {
      return markInstagramConnectionState(userId, {
        instagramConnectionStatus: "selection_required",
        instagramConnectionErrorCode: "",
        instagramCandidateAccounts: candidates,
        instagramAccessToken: "",
        instagramBusinessAccountId: "",
      });
    }

    const selectedPageId =
      summary.selectedPageId || (candidates.length === 1 ? candidates[0]?.pageId ?? "" : "");
    const selectedPage = pages.find((page) => (page.id?.trim() ?? "") === selectedPageId);
    const selectedCandidate = candidates.find((candidate) => candidate.pageId === selectedPageId);

    if (!selectedPage) {
      return markInstagramConnectionState(userId, {
        instagramConnectionStatus: "missing_page_linkage",
        instagramConnectionErrorCode: "missing_page_linkage",
        instagramCandidateAccounts: candidates,
        instagramAccessToken: "",
      });
    }

    if (!selectedPage.instagram_business_account?.id?.trim()) {
      return markInstagramConnectionState(userId, {
        instagramConnectionStatus: "missing_instagram_business_account",
        instagramConnectionErrorCode: "missing_instagram_business_account",
        instagramCandidateAccounts: candidates,
        instagramAccessToken: "",
      });
    }

    const pageAccessToken = selectedPage.access_token?.trim() ?? "";
    if (!pageAccessToken) {
      return markInstagramConnectionState(userId, {
        instagramConnectionStatus: "needs_reconnect",
        instagramConnectionErrorCode: "missing_page_access_token",
        instagramCandidateAccounts: candidates,
        instagramAccessToken: "",
      });
    }

    return persistConnectedPageSelection({
      userId,
      longLivedUserToken,
      pageId: selectedPageId,
      pageName:
        selectedCandidate?.pageName ?? selectedPage.name?.trim() ?? summary.selectedPageName,
      pageAccessToken,
      instagramBusinessAccountId:
        selectedCandidate?.instagramBusinessAccountId ??
        selectedPage.instagram_business_account?.id?.trim() ??
        summary.selectedInstagramBusinessAccountId,
      tokenExpiresAt: settings.instagramTokenExpiresAt ?? "",
    });
  } catch (error) {
    console.warn("[flowcart:instagram:validate]", {
      stage: "validate_failed",
      userIdPrefix: userId.slice(0, 8),
      selectedPageId: summary.selectedPageId,
      hasUserToken: summary.hasLongLivedUserToken,
      reason: error instanceof Error ? error.message : "unknown",
    });
    return markInstagramConnectionState(userId, {
      instagramConnectionStatus: "invalid_expired_token",
      instagramConnectionErrorCode: "invalid_expired_token",
    });
  }
}

export async function selectInstagramCandidate(input: {
  userId: string;
  pageId: string;
  instagramBusinessAccountId: string;
}): Promise<InstagramConnectionSummary> {
  const settings = await getDbSettings(input.userId);
  const candidates = sanitizeCandidateAccounts(settings.instagramCandidateAccounts);
  const candidate = candidates.find(
    (item) =>
      item.pageId === input.pageId.trim() &&
      item.instagramBusinessAccountId === input.instagramBusinessAccountId.trim()
  );

  if (!candidate) {
    throw new Error("The selected Instagram account is no longer available.");
  }

  const encryptedUserToken = settings.instagramUserAccessToken?.trim() ?? "";
  if (!encryptedUserToken) {
    throw new Error("Instagram must be reconnected before selecting an account.");
  }

  const longLivedUserToken = decryptInstagramToken(encryptedUserToken);
  const pages = await fetchManagedPages(longLivedUserToken);
  const selectedPage = pages.find((page) => (page.id?.trim() ?? "") === candidate.pageId);

  if (!selectedPage?.access_token?.trim()) {
    throw new Error("The selected Instagram account is no longer available.");
  }

  const businessAccountId =
    selectedPage.instagram_business_account?.id?.trim() ?? "";
  if (!businessAccountId || businessAccountId !== candidate.instagramBusinessAccountId) {
    throw new Error("The selected Instagram account is no longer available.");
  }

  return persistConnectedPageSelection({
    userId: input.userId,
    longLivedUserToken,
    pageId: candidate.pageId,
    pageName: candidate.pageName,
    pageAccessToken: selectedPage.access_token.trim(),
    instagramBusinessAccountId: businessAccountId,
    tokenExpiresAt: settings.instagramTokenExpiresAt ?? "",
  });
}

export async function clearInstagramConnection(
  userId: string
): Promise<InstagramConnectionSummary> {
  const cleared = await clearInstagramConnectionState(userId);
  return getStoredInstagramConnectionSummary(cleared);
}

export function getResolvedInstagramFields(
  credentials: ActiveInstagramCredentials | null
): Pick<ConnectionSettings, "instagramAccessToken" | "instagramBusinessAccountId"> {
  return {
    instagramAccessToken: credentials?.publishAccessToken ?? "",
    instagramBusinessAccountId: credentials?.instagramBusinessAccountId ?? "",
  };
}

export function canUseInstagramOAuthStorage(settings: ConnectionSettings): boolean {
  return Boolean(settings.instagramUserAccessToken?.trim()) && hasInstagramTokenEncryptionConfigured();
}

export function hasStoredInstagramOauthTokens(settings: ConnectionSettings): boolean {
  return (
    Boolean(settings.instagramUserAccessToken?.trim()) &&
    isEncryptedInstagramToken(settings.instagramUserAccessToken ?? "") &&
    Boolean(settings.instagramAccessToken.trim()) &&
    isEncryptedInstagramToken(settings.instagramAccessToken)
  );
}
