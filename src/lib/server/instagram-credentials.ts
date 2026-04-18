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
}

interface MetaPageInstagramLink {
  instagram_business_account?: {
    id?: string;
  };
  connected_instagram_account?: {
    id?: string;
  };
  name?: string;
}

interface MetaManagedPagesResponse {
  data?: MetaManagedPage[];
}

type InstagramLinkSource = "instagram_business_account" | "connected_instagram_account" | "none";

interface DiscoveredManagedPage {
  pageId: string;
  pageName: string;
  pageAccessToken: string;
  instagramBusinessAccountId: string;
  linkSource: InstagramLinkSource;
}

function buildResolverLogContext(input: {
  userId?: string;
  statePrefix?: string;
}): Record<string, string> {
  const context: Record<string, string> = {};
  const statePrefix = input.statePrefix?.trim();
  const userId = input.userId?.trim();

  if (statePrefix) {
    context.statePrefix = statePrefix;
  }

  if (userId) {
    context.userIdPrefix = userId.slice(0, 8);
  }

  return context;
}

function logResolverInfo(
  stage: string,
  input: {
    userId?: string;
    statePrefix?: string;
    details?: Record<string, unknown>;
  }
) {
  console.info("[flowcart:instagram:resolver]", {
    stage,
    ...buildResolverLogContext(input),
    ...(input.details ?? {}),
  });
}

function logResolverWarn(
  stage: string,
  input: {
    userId?: string;
    statePrefix?: string;
    details?: Record<string, unknown>;
  }
) {
  console.warn("[flowcart:instagram:resolver]", {
    stage,
    ...buildResolverLogContext(input),
    ...(input.details ?? {}),
  });
}

function logPersistedConnection(input: {
  stage: "oauth_connection_persisted" | "validation_persisted";
  userId: string;
  statePrefix?: string;
  selectionRequired?: boolean;
  connection: InstagramConnectionSummary;
}) {
  logResolverInfo(input.stage, {
    userId: input.userId,
    statePrefix: input.statePrefix,
    details: {
      selectionRequired: Boolean(input.selectionRequired),
      selectedPageId: input.connection.selectedPageId,
      selectedInstagramBusinessAccountId:
        input.connection.selectedInstagramBusinessAccountId,
      status: input.connection.status,
      errorCode: input.connection.errorCode,
    },
  });
}

async function fetchManagedPages(longLivedUserToken: string): Promise<MetaManagedPage[]> {
  const response = await fetchMetaJson<MetaManagedPagesResponse>({
    path: "me/accounts",
    searchParams: new URLSearchParams({
      fields: "id,name,access_token",
      access_token: longLivedUserToken,
    }),
  });

  return Array.isArray(response.data) ? response.data : [];
}

async function fetchPageInstagramLink(
  pageId: string,
  pageAccessToken: string
): Promise<MetaPageInstagramLink> {
  return fetchMetaJson<MetaPageInstagramLink>({
    path: pageId,
    searchParams: new URLSearchParams({
      fields: "instagram_business_account{id},connected_instagram_account{id},name",
      access_token: pageAccessToken,
    }),
  });
}

function normalizeInstagramBusinessAccount(input: MetaPageInstagramLink): {
  instagramBusinessAccountId: string;
  linkSource: InstagramLinkSource;
} {
  const instagramBusinessAccountId = input.instagram_business_account?.id?.trim() ?? "";
  if (instagramBusinessAccountId) {
    return { instagramBusinessAccountId, linkSource: "instagram_business_account" };
  }

  const connectedInstagramAccountId = input.connected_instagram_account?.id?.trim() ?? "";
  if (connectedInstagramAccountId) {
    return {
      instagramBusinessAccountId: connectedInstagramAccountId,
      linkSource: "connected_instagram_account",
    };
  }

  return { instagramBusinessAccountId: "", linkSource: "none" };
}

async function discoverManagedPages(input: {
  longLivedUserToken: string;
  userId?: string;
  statePrefix?: string;
}): Promise<DiscoveredManagedPage[]> {
  const managedPages = await fetchManagedPages(input.longLivedUserToken);
  const pageIds = managedPages
    .map((page) => page.id?.trim() ?? "")
    .filter((pageId) => pageId.length > 0);
  const pagesWithAccessToken = managedPages.filter((page) =>
    Boolean(page.access_token?.trim())
  ).length;

  logResolverInfo("managed_pages_fetched", {
    userId: input.userId,
    statePrefix: input.statePrefix,
    details: {
      pageIds,
      pageCount: managedPages.length,
      pagesWithAccessToken,
    },
  });

  if (managedPages.length === 0) {
    logResolverInfo("managed_pages_empty", {
      userId: input.userId,
      statePrefix: input.statePrefix,
      details: {
        pageCount: 0,
      },
    });
    return [];
  }

  const discoveredPages = (
    await Promise.all(
      managedPages.map(async (page) => {
        const pageId = page.id?.trim() ?? "";
        const pageName = page.name?.trim() ?? "";
        const pageAccessToken = page.access_token?.trim() ?? "";

        if (!pageId) {
          return null;
        }

        if (!pageAccessToken) {
          logResolverInfo("managed_page_lookup_result", {
            userId: input.userId,
            statePrefix: input.statePrefix,
            details: {
              pageId,
              pageName,
              hasPageAccessToken: false,
              hasInstagramBusinessAccount: false,
              hasConnectedInstagramAccount: false,
              normalizedInstagramBusinessAccountId: "",
              linkSource: "none",
            },
          });
          return {
            pageId,
            pageName,
            pageAccessToken,
            instagramBusinessAccountId: "",
            linkSource: "none" as const,
          };
        }

        try {
          const lookup = await fetchPageInstagramLink(pageId, pageAccessToken);
          const normalized = normalizeInstagramBusinessAccount(lookup);
          const hasInstagramBusinessAccount = Boolean(
            lookup.instagram_business_account?.id?.trim()
          );
          const hasConnectedInstagramAccount = Boolean(
            lookup.connected_instagram_account?.id?.trim()
          );
          const discoveredPage: DiscoveredManagedPage = {
            pageId,
            pageName: lookup.name?.trim() ?? pageName,
            pageAccessToken,
            instagramBusinessAccountId: normalized.instagramBusinessAccountId,
            linkSource: normalized.linkSource,
          };

          logResolverInfo("managed_page_lookup_result", {
            userId: input.userId,
            statePrefix: input.statePrefix,
            details: {
              pageId,
              pageName: discoveredPage.pageName,
              hasPageAccessToken: true,
              hasInstagramBusinessAccount,
              hasConnectedInstagramAccount,
              normalizedInstagramBusinessAccountId:
                normalized.instagramBusinessAccountId,
              linkSource: normalized.linkSource,
            },
          });

          if (normalized.linkSource === "instagram_business_account") {
            logResolverInfo("page_link_found_instagram_business_account", {
              userId: input.userId,
              statePrefix: input.statePrefix,
              details: {
                pageId,
                pageName: discoveredPage.pageName,
              },
            });
          } else if (normalized.linkSource === "connected_instagram_account") {
            logResolverInfo("page_link_found_connected_instagram_account", {
              userId: input.userId,
              statePrefix: input.statePrefix,
              details: {
                pageId,
                pageName: discoveredPage.pageName,
              },
            });
          }

          return discoveredPage;
        } catch (error) {
          logResolverWarn("managed_page_lookup_failed", {
            userId: input.userId,
            statePrefix: input.statePrefix,
            details: {
              pageId,
              pageName,
              hasPageAccessToken: true,
              reason: error instanceof Error ? error.message : "unknown",
            },
          });
          return {
            pageId,
            pageName,
            pageAccessToken,
            instagramBusinessAccountId: "",
            linkSource: "none" as const,
          };
        }
      })
    )
  ).flatMap((page) => (page ? [page] : []));

  if (!discoveredPages.some((page) => page.instagramBusinessAccountId)) {
    logResolverInfo("managed_pages_returned_no_ig_link", {
      userId: input.userId,
      statePrefix: input.statePrefix,
      details: {
        pageCount: discoveredPages.length,
      },
    });
  }

  return discoveredPages;
}

function pagesToCandidates(pages: DiscoveredManagedPage[]): InstagramCandidateAccount[] {
  return pages.flatMap((page) => {
    const pageId = page.pageId;
    const instagramBusinessAccountId = page.instagramBusinessAccountId;

    if (!pageId || !instagramBusinessAccountId) {
      return [];
    }

    return [
      {
        pageId,
        pageName: page.pageName,
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
  statePrefix?: string;
}): Promise<{
  connection: InstagramConnectionSummary;
  selectionRequired: boolean;
  discovery: {
    pageCount: number;
    pagesWithAccessToken: number;
    pageIds: string[];
    candidateCount: number;
  };
}> {
  const pages = await discoverManagedPages({
    longLivedUserToken: input.longLivedUserToken,
    userId: input.userId,
    statePrefix: input.statePrefix,
  });
  const candidates = pagesToCandidates(pages);
  const discovery = {
    pageCount: pages.length,
    pagesWithAccessToken: pages.filter((page) => Boolean(page.pageAccessToken)).length,
    pageIds: pages.map((page) => page.pageId),
    candidateCount: candidates.length,
  };

  logResolverInfo("oauth_connection_candidates_resolved", {
    userId: input.userId,
    statePrefix: input.statePrefix,
    details: {
      pageCount: discovery.pageCount,
      pageIds: discovery.pageIds,
      candidatePairs: candidates.map((candidate) => ({
        pageId: candidate.pageId,
        instagramBusinessAccountId: candidate.instagramBusinessAccountId,
      })),
    },
  });

  if (candidates.length === 0) {
    const connection = await markInstagramConnectionState(input.userId, {
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
    });
    logPersistedConnection({
      stage: "oauth_connection_persisted",
      userId: input.userId,
      statePrefix: input.statePrefix,
      selectionRequired: false,
      connection,
    });
    return {
      connection,
      selectionRequired: false,
      discovery,
    };
  }

  if (candidates.length > 1) {
    const connection = await markInstagramConnectionState(input.userId, {
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
    });
    logPersistedConnection({
      stage: "oauth_connection_persisted",
      userId: input.userId,
      statePrefix: input.statePrefix,
      selectionRequired: true,
      connection,
    });
    return {
      connection,
      selectionRequired: true,
      discovery,
    };
  }

  const candidate = candidates[0];
  const selectedPage = pages.find((page) => page.pageId === candidate.pageId);
  const pageAccessToken = selectedPage?.pageAccessToken ?? "";

  if (!pageAccessToken) {
    logResolverWarn("selected_page_missing_access_token", {
      userId: input.userId,
      statePrefix: input.statePrefix,
      details: {
        pageId: candidate.pageId,
        pageName: candidate.pageName,
      },
    });
    const connection = await markInstagramConnectionState(input.userId, {
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
    });
    logPersistedConnection({
      stage: "oauth_connection_persisted",
      userId: input.userId,
      statePrefix: input.statePrefix,
      selectionRequired: false,
      connection,
    });
    return {
      connection,
      selectionRequired: false,
      discovery,
    };
  }

  const connection = await persistConnectedPageSelection({
    userId: input.userId,
    longLivedUserToken: input.longLivedUserToken,
    pageId: candidate.pageId,
    pageName: candidate.pageName,
    pageAccessToken,
    instagramBusinessAccountId: candidate.instagramBusinessAccountId,
    tokenExpiresAt: input.tokenExpiresAt ?? "",
  });
  logPersistedConnection({
    stage: "oauth_connection_persisted",
    userId: input.userId,
    statePrefix: input.statePrefix,
    selectionRequired: false,
    connection,
  });

  return {
    connection,
    selectionRequired: false,
    discovery,
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
    const pages = await discoverManagedPages({
      longLivedUserToken,
      userId,
    });
    const selectedPage = pages.find((page) => page.pageId === summary.selectedPageId);
    const pageAccessToken = selectedPage?.pageAccessToken ?? "";
    const businessAccountId = selectedPage?.instagramBusinessAccountId ?? "";

    if (!selectedPage) {
      await markInstagramConnectionState(userId, {
        instagramConnectionStatus: "missing_page_linkage",
        instagramConnectionErrorCode: "missing_page_linkage",
        instagramAccessToken: "",
      });
      return null;
    }

    if (!businessAccountId) {
      console.warn("[flowcart:instagram:resolver]", {
        stage: "selected_page_missing_ig_link",
        userIdPrefix: userId.slice(0, 8),
        pageId: summary.selectedPageId,
      });
      await markInstagramConnectionState(userId, {
        instagramConnectionStatus: "missing_instagram_business_account",
        instagramConnectionErrorCode: "missing_instagram_business_account",
        instagramAccessToken: "",
      });
      return null;
    }

    if (!pageAccessToken) {
      console.warn("[flowcart:instagram:resolver]", {
        stage: "selected_page_missing_access_token",
        userIdPrefix: userId.slice(0, 8),
        pageId: summary.selectedPageId,
      });
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
      instagramPageName: selectedPage.pageName || summary.selectedPageName,
      instagramConnectionStatus: "connected",
      instagramConnectionErrorCode: "",
      instagramLastValidatedAt: new Date().toISOString(),
    });

    return buildOauthCredentials({
      source: "oauth_derived_page_token",
      pageId: summary.selectedPageId,
      pageName: selectedPage.pageName || summary.selectedPageName,
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

  logResolverInfo("validation_started", {
    userId,
    details: {
      selectedPageId: summary.selectedPageId,
      selectedInstagramBusinessAccountId:
        summary.selectedInstagramBusinessAccountId,
      status: summary.status,
      errorCode: summary.errorCode,
    },
  });

  if (summary.status === "legacy_fallback") {
    const connection = await markInstagramConnectionState(userId, {
      instagramConnectionStatus: "legacy_fallback",
      instagramConnectionErrorCode: "",
      instagramLastValidatedAt: new Date().toISOString(),
    });
    logPersistedConnection({
      stage: "validation_persisted",
      userId,
      connection,
    });
    return connection;
  }

  const encryptedUserToken = settings.instagramUserAccessToken?.trim() ?? "";
  if (!encryptedUserToken) {
    const connection = await markInstagramConnectionState(userId, {
      instagramConnectionStatus: "needs_reconnect",
      instagramConnectionErrorCode: "missing_user_token",
    });
    logPersistedConnection({
      stage: "validation_persisted",
      userId,
      connection,
    });
    return connection;
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
    const connection = await markInstagramConnectionState(userId, {
      instagramConnectionStatus: "invalid_expired_token",
      instagramConnectionErrorCode: "invalid_expired_token",
    });
    logPersistedConnection({
      stage: "validation_persisted",
      userId,
      connection,
    });
    return connection;
  }

  try {
    const pages = await discoverManagedPages({
      longLivedUserToken,
      userId,
    });
    const candidates = pagesToCandidates(pages);

    if (!pages.length) {
      const connection = await markInstagramConnectionState(userId, {
        instagramConnectionStatus: "missing_page_linkage",
        instagramConnectionErrorCode: "missing_page_linkage",
        instagramAccessToken: "",
        instagramCandidateAccounts: [],
      });
      logPersistedConnection({
        stage: "validation_persisted",
        userId,
        connection,
      });
      return connection;
    }

    if (candidates.length > 1 && !summary.selectedPageId) {
      const connection = await markInstagramConnectionState(userId, {
        instagramConnectionStatus: "selection_required",
        instagramConnectionErrorCode: "",
        instagramCandidateAccounts: candidates,
        instagramAccessToken: "",
        instagramBusinessAccountId: "",
      });
      logPersistedConnection({
        stage: "validation_persisted",
        userId,
        connection,
      });
      return connection;
    }

    const selectedPageId =
      summary.selectedPageId || (candidates.length === 1 ? candidates[0]?.pageId ?? "" : "");
    const selectedPage = pages.find((page) => page.pageId === selectedPageId);
    const selectedCandidate = candidates.find((candidate) => candidate.pageId === selectedPageId);

    if (!selectedPage) {
      const connection = await markInstagramConnectionState(userId, {
        instagramConnectionStatus: "missing_page_linkage",
        instagramConnectionErrorCode: "missing_page_linkage",
        instagramCandidateAccounts: candidates,
        instagramAccessToken: "",
      });
      logPersistedConnection({
        stage: "validation_persisted",
        userId,
        connection,
      });
      return connection;
    }

    if (!selectedPage.instagramBusinessAccountId) {
      logResolverWarn("selected_page_missing_ig_link", {
        userId,
        details: {
          pageId: selectedPageId,
        },
      });
      const connection = await markInstagramConnectionState(userId, {
        instagramConnectionStatus: "missing_instagram_business_account",
        instagramConnectionErrorCode: "missing_instagram_business_account",
        instagramCandidateAccounts: candidates,
        instagramAccessToken: "",
      });
      logPersistedConnection({
        stage: "validation_persisted",
        userId,
        connection,
      });
      return connection;
    }

    const pageAccessToken = selectedPage.pageAccessToken;
    if (!pageAccessToken) {
      logResolverWarn("selected_page_missing_access_token", {
        userId,
        details: {
          pageId: selectedPageId,
        },
      });
      const connection = await markInstagramConnectionState(userId, {
        instagramConnectionStatus: "needs_reconnect",
        instagramConnectionErrorCode: "missing_page_access_token",
        instagramCandidateAccounts: candidates,
        instagramAccessToken: "",
      });
      logPersistedConnection({
        stage: "validation_persisted",
        userId,
        connection,
      });
      return connection;
    }

    const connection = await persistConnectedPageSelection({
      userId,
      longLivedUserToken,
      pageId: selectedPageId,
      pageName: selectedCandidate?.pageName || selectedPage.pageName || summary.selectedPageName,
      pageAccessToken,
      instagramBusinessAccountId:
        selectedCandidate?.instagramBusinessAccountId || selectedPage.instagramBusinessAccountId,
      tokenExpiresAt: settings.instagramTokenExpiresAt ?? "",
    });
    logPersistedConnection({
      stage: "validation_persisted",
      userId,
      connection,
    });
    return connection;
  } catch (error) {
    console.warn("[flowcart:instagram:validate]", {
      stage: "validate_failed",
      userIdPrefix: userId.slice(0, 8),
      selectedPageId: summary.selectedPageId,
      hasUserToken: summary.hasLongLivedUserToken,
      reason: error instanceof Error ? error.message : "unknown",
    });
    const connection = await markInstagramConnectionState(userId, {
      instagramConnectionStatus: "invalid_expired_token",
      instagramConnectionErrorCode: "invalid_expired_token",
    });
    logPersistedConnection({
      stage: "validation_persisted",
      userId,
      connection,
    });
    return connection;
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
  const pages = await discoverManagedPages({
    longLivedUserToken,
    userId: input.userId,
  });
  const selectedPage = pages.find((page) => page.pageId === candidate.pageId);

  if (!selectedPage?.pageAccessToken) {
    console.warn("[flowcart:instagram:resolver]", {
      stage: "selected_page_missing_access_token",
      userIdPrefix: input.userId.slice(0, 8),
      pageId: candidate.pageId,
      pageName: candidate.pageName,
    });
    throw new Error("The selected Instagram account is no longer available.");
  }

  const businessAccountId = selectedPage.instagramBusinessAccountId;
  if (!businessAccountId || businessAccountId !== candidate.instagramBusinessAccountId) {
    console.warn("[flowcart:instagram:resolver]", {
      stage: "selected_page_missing_ig_link",
      userIdPrefix: input.userId.slice(0, 8),
      pageId: candidate.pageId,
      pageName: candidate.pageName,
    });
    throw new Error("The selected Instagram account is no longer available.");
  }

  return persistConnectedPageSelection({
    userId: input.userId,
    longLivedUserToken,
    pageId: candidate.pageId,
    pageName: selectedPage.pageName || candidate.pageName,
    pageAccessToken: selectedPage.pageAccessToken,
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
