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
import {
  fetchMetaJson,
  getMetaAppId,
  getMetaAppSecret,
} from "@/src/lib/server/instagram";
import {
  getStoredInstagramConnectionSummary,
  sanitizeCandidateAccounts,
} from "@/src/lib/server/instagram-connection-summary";

interface MetaManagedPage {
  id?: string;
  name?: string;
  access_token?: string;
  tasks?: string[];
  instagram_business_account?: {
    id?: string;
  };
  connected_instagram_account?: {
    id?: string;
  };
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

interface MetaDebugGranularScope {
  scope?: string;
  target_ids?: string[];
}

interface MetaDebugTokenResponse {
  data?: {
    granular_scopes?: MetaDebugGranularScope[];
  };
}

interface MetaInstagramAccountsEdgeResponse {
  data?: Array<{
    id?: string;
    username?: string;
  }>;
}

interface MetaInstagramAccountProfile {
  id?: string;
  username?: string;
}

interface MetaInstagramPublishingLimitResponse {
  data?: Array<{
    quota_usage?: number;
    config?: {
      quota_total?: number;
    };
  }>;
}

type InstagramLinkSource =
  | "instagram_business_account"
  | "connected_instagram_account"
  | "instagram_accounts_edge"
  | "none";

interface DiscoveredManagedPage {
  pageId: string;
  pageName: string;
  pageAccessToken: string;
  instagramBusinessAccountId: string;
  linkSource: InstagramLinkSource;
}

interface DirectInstagramAssetSelection {
  pageId: string;
  pageName: string;
  instagramBusinessAccountId: string;
}

function asUniqueIds(values: Iterable<string>): string[] {
  const unique = new Set<string>();
  for (const value of values) {
    const trimmed = value.trim();
    if (trimmed) {
      unique.add(trimmed);
    }
  }
  return [...unique];
}

function extractDebugTargetIds(payload: MetaDebugTokenResponse): string[] {
  const granularScopes = Array.isArray(payload.data?.granular_scopes)
    ? payload.data?.granular_scopes
    : [];
  return asUniqueIds(
    granularScopes.flatMap((scope) =>
      Array.isArray(scope?.target_ids) ? scope.target_ids : []
    )
  );
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
      fields:
        "id,name,access_token,tasks,instagram_business_account{id},connected_instagram_account{id}",
      access_token: longLivedUserToken,
    }),
  });

  return Array.isArray(response.data) ? response.data : [];
}

async function fetchPageInstagramLink(
  pageId: string,
  accessToken: string
): Promise<MetaPageInstagramLink> {
  return fetchMetaJson<MetaPageInstagramLink>({
    path: pageId,
    searchParams: new URLSearchParams({
      fields: "instagram_business_account{id},connected_instagram_account{id},name",
      access_token: accessToken,
    }),
  });
}

async function fetchPageInstagramAccounts(
  pageId: string,
  accessToken: string
): Promise<MetaInstagramAccountsEdgeResponse> {
  return fetchMetaJson<MetaInstagramAccountsEdgeResponse>({
    path: `${pageId}/instagram_accounts`,
    searchParams: new URLSearchParams({
      fields: "id,username",
      access_token: accessToken,
    }),
  });
}

async function fetchDebugTargetIds(longLivedUserToken: string): Promise<string[]> {
  const appId = getMetaAppId();
  const appSecret = getMetaAppSecret();
  if (!appId || !appSecret) {
    return [];
  }

  const response = await fetchMetaJson<MetaDebugTokenResponse>({
    path: "debug_token",
    searchParams: new URLSearchParams({
      input_token: longLivedUserToken,
      access_token: `${appId}|${appSecret}`,
    }),
  });

  return extractDebugTargetIds(response);
}

async function fetchInstagramAccountProfile(
  instagramBusinessAccountId: string,
  accessToken: string
): Promise<MetaInstagramAccountProfile> {
  return fetchMetaJson<MetaInstagramAccountProfile>({
    path: instagramBusinessAccountId,
    searchParams: new URLSearchParams({
      fields: "id,username",
      access_token: accessToken,
    }),
  });
}

async function fetchInstagramPublishingLimit(
  instagramBusinessAccountId: string,
  accessToken: string
): Promise<MetaInstagramPublishingLimitResponse> {
  return fetchMetaJson<MetaInstagramPublishingLimitResponse>({
    path: `${instagramBusinessAccountId}/content_publishing_limit`,
    searchParams: new URLSearchParams({
      access_token: accessToken,
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

function normalizeInstagramAccountsEdge(input: MetaInstagramAccountsEdgeResponse): {
  instagramBusinessAccountId: string;
  linkSource: InstagramLinkSource;
} {
  const instagramBusinessAccountId =
    input.data?.find((account) => account.id?.trim())?.id?.trim() ?? "";
  if (!instagramBusinessAccountId) {
    return { instagramBusinessAccountId: "", linkSource: "none" };
  }

  return {
    instagramBusinessAccountId,
    linkSource: "instagram_accounts_edge",
  };
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
        const managedPageNormalized = normalizeInstagramBusinessAccount(page);
        const hasInstagramBusinessAccount = Boolean(page.instagram_business_account?.id?.trim());
        const hasConnectedInstagramAccount = Boolean(
          page.connected_instagram_account?.id?.trim()
        );

        if (!pageId) {
          return null;
        }

        if (managedPageNormalized.instagramBusinessAccountId) {
          const discoveredPage: DiscoveredManagedPage = {
            pageId,
            pageName,
            pageAccessToken,
            instagramBusinessAccountId: managedPageNormalized.instagramBusinessAccountId,
            linkSource: managedPageNormalized.linkSource,
          };

          logResolverInfo("managed_page_lookup_result", {
            userId: input.userId,
            statePrefix: input.statePrefix,
            details: {
              pageId,
              pageName,
              hasPageAccessToken: Boolean(pageAccessToken),
              hasInstagramBusinessAccount,
              hasConnectedInstagramAccount,
              hasInstagramAccountsEdge: false,
              normalizedInstagramBusinessAccountId:
                managedPageNormalized.instagramBusinessAccountId,
              linkSource: managedPageNormalized.linkSource,
            },
          });

          if (managedPageNormalized.linkSource === "instagram_business_account") {
            logResolverInfo("page_link_found_instagram_business_account", {
              userId: input.userId,
              statePrefix: input.statePrefix,
              details: {
                pageId,
                pageName,
              },
            });
          } else if (managedPageNormalized.linkSource === "connected_instagram_account") {
            logResolverInfo("page_link_found_connected_instagram_account", {
              userId: input.userId,
              statePrefix: input.statePrefix,
              details: {
                pageId,
                pageName,
              },
            });
          }

          return discoveredPage;
        }

        let resolvedPageName = pageName;

        try {
          const lookup = await fetchPageInstagramLink(pageId, input.longLivedUserToken);
          const normalized = normalizeInstagramBusinessAccount(lookup);
          const lookupHasInstagramBusinessAccount = Boolean(
            lookup.instagram_business_account?.id?.trim()
          );
          const lookupHasConnectedInstagramAccount = Boolean(
            lookup.connected_instagram_account?.id?.trim()
          );
          resolvedPageName = lookup.name?.trim() ?? pageName;

          if (normalized.instagramBusinessAccountId) {
            const discoveredPage: DiscoveredManagedPage = {
              pageId,
              pageName: resolvedPageName,
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
                hasPageAccessToken: Boolean(pageAccessToken),
                hasInstagramBusinessAccount: lookupHasInstagramBusinessAccount,
                hasConnectedInstagramAccount: lookupHasConnectedInstagramAccount,
                hasInstagramAccountsEdge: false,
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
          }

          const edgeLookup = await fetchPageInstagramAccounts(pageId, input.longLivedUserToken);
          const edgeNormalized = normalizeInstagramAccountsEdge(edgeLookup);
          const discoveredPage: DiscoveredManagedPage = {
            pageId,
            pageName: resolvedPageName,
            pageAccessToken,
            instagramBusinessAccountId: edgeNormalized.instagramBusinessAccountId,
            linkSource: edgeNormalized.linkSource,
          };

          logResolverInfo("managed_page_lookup_result", {
            userId: input.userId,
            statePrefix: input.statePrefix,
            details: {
              pageId,
              pageName: discoveredPage.pageName,
              hasPageAccessToken: Boolean(pageAccessToken),
              hasInstagramBusinessAccount: lookupHasInstagramBusinessAccount,
              hasConnectedInstagramAccount: lookupHasConnectedInstagramAccount,
              hasInstagramAccountsEdge: Boolean(edgeNormalized.instagramBusinessAccountId),
              normalizedInstagramBusinessAccountId:
                edgeNormalized.instagramBusinessAccountId,
              linkSource: edgeNormalized.linkSource,
            },
          });

          if (edgeNormalized.linkSource === "instagram_accounts_edge") {
            logResolverInfo("page_link_found_instagram_accounts_edge", {
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
              hasPageAccessToken: Boolean(pageAccessToken),
              reason: error instanceof Error ? error.message : "unknown",
            },
          });

          try {
            const edgeLookup = await fetchPageInstagramAccounts(pageId, input.longLivedUserToken);
            const edgeNormalized = normalizeInstagramAccountsEdge(edgeLookup);
            const discoveredPage: DiscoveredManagedPage = {
              pageId,
              pageName: resolvedPageName,
              pageAccessToken,
              instagramBusinessAccountId: edgeNormalized.instagramBusinessAccountId,
              linkSource: edgeNormalized.linkSource,
            };

            logResolverInfo("managed_page_lookup_result", {
              userId: input.userId,
              statePrefix: input.statePrefix,
              details: {
                pageId,
                pageName: discoveredPage.pageName,
                hasPageAccessToken: Boolean(pageAccessToken),
                hasInstagramBusinessAccount: false,
                hasConnectedInstagramAccount: false,
                hasInstagramAccountsEdge: Boolean(edgeNormalized.instagramBusinessAccountId),
                normalizedInstagramBusinessAccountId:
                  edgeNormalized.instagramBusinessAccountId,
                linkSource: edgeNormalized.linkSource,
              },
            });

            if (edgeNormalized.linkSource === "instagram_accounts_edge") {
              logResolverInfo("page_link_found_instagram_accounts_edge", {
                userId: input.userId,
                statePrefix: input.statePrefix,
                details: {
                  pageId,
                  pageName: discoveredPage.pageName,
                },
              });
            }

            return discoveredPage;
          } catch (edgeError) {
            logResolverWarn("managed_page_instagram_accounts_failed", {
              userId: input.userId,
              statePrefix: input.statePrefix,
              details: {
                pageId,
                pageName,
                hasPageAccessToken: Boolean(pageAccessToken),
                reason: edgeError instanceof Error ? edgeError.message : "unknown",
              },
            });
          }

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

function hasInstagramLink(page: DiscoveredManagedPage): boolean {
  return Boolean(page.pageId && page.instagramBusinessAccountId);
}

function pagesToCandidates(pages: DiscoveredManagedPage[]): InstagramCandidateAccount[] {
  return pages.flatMap((page) => {
    const pageId = page.pageId;
    const instagramBusinessAccountId = page.instagramBusinessAccountId;

    if (!pageId || !instagramBusinessAccountId || !page.pageAccessToken) {
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

function getLinkedPages(pages: DiscoveredManagedPage[]): DiscoveredManagedPage[] {
  return pages.filter(hasInstagramLink);
}

function buildSelectedPagePatch(
  page: Pick<
    DiscoveredManagedPage,
    "pageId" | "pageName" | "instagramBusinessAccountId"
  > | null
): Pick<
  ConnectionSettings,
  "instagramPageId" | "instagramPageName" | "instagramBusinessAccountId"
> {
  return {
    instagramPageId: page?.pageId ?? "",
    instagramPageName: page?.pageName ?? "",
    instagramBusinessAccountId: page?.instagramBusinessAccountId ?? "",
  };
}

function buildOauthCredentials(
  input: Omit<ActiveInstagramCredentials, "status">
): ActiveInstagramCredentials {
  return {
    status: "connected",
    ...input,
  };
}

async function persistConnectedSelection(input: {
  userId: string;
  longLivedUserToken: string;
  pageId: string;
  pageName: string;
  publishAccessToken: string;
  instagramBusinessAccountId: string;
  tokenExpiresAt?: string;
}): Promise<InstagramConnectionSummary> {
  const saved = await saveInstagramConnectionState(input.userId, {
    instagramUserAccessToken: encryptInstagramToken(input.longLivedUserToken),
    instagramAccessToken: encryptInstagramToken(input.publishAccessToken),
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

async function resolveDirectInstagramAssetSelection(input: {
  longLivedUserToken: string;
  pages?: DiscoveredManagedPage[];
  selectedPageId?: string;
  selectedPageName?: string;
  selectedInstagramBusinessAccountId?: string;
  userId?: string;
  statePrefix?: string;
}): Promise<DirectInstagramAssetSelection | null> {
  let debugTargetIds: string[] = [];

  try {
    debugTargetIds = await fetchDebugTargetIds(input.longLivedUserToken);
  } catch (error) {
    logResolverWarn("debug_token_lookup_failed", {
      userId: input.userId,
      statePrefix: input.statePrefix,
      details: {
        reason: error instanceof Error ? error.message : "unknown",
      },
    });
  }

  logResolverInfo("debug_token_targets_resolved", {
    userId: input.userId,
    statePrefix: input.statePrefix,
    details: {
      targetIds: debugTargetIds,
      targetCount: debugTargetIds.length,
    },
  });

  const candidateInstagramIds = asUniqueIds([
    input.selectedInstagramBusinessAccountId?.trim() ?? "",
    ...debugTargetIds,
  ]);

  let resolvedInstagramBusinessAccountId = "";
  for (const instagramBusinessAccountId of candidateInstagramIds) {
    try {
      const profile = await fetchInstagramAccountProfile(
        instagramBusinessAccountId,
        input.longLivedUserToken
      );
      const reachableInstagramBusinessAccountId = profile.id?.trim() ?? "";
      if (!reachableInstagramBusinessAccountId) {
        continue;
      }

      await fetchInstagramPublishingLimit(
        reachableInstagramBusinessAccountId,
        input.longLivedUserToken
      );
      resolvedInstagramBusinessAccountId = reachableInstagramBusinessAccountId;

      logResolverInfo("direct_instagram_asset_reachable", {
        userId: input.userId,
        statePrefix: input.statePrefix,
        details: {
          instagramBusinessAccountId: resolvedInstagramBusinessAccountId,
          username: profile.username?.trim() ?? "",
          publishableWithUserToken: true,
        },
      });
      break;
    } catch (error) {
      logResolverWarn("direct_instagram_asset_unreachable", {
        userId: input.userId,
        statePrefix: input.statePrefix,
        details: {
          instagramBusinessAccountId,
          reason: error instanceof Error ? error.message : "unknown",
        },
      });
    }
  }

  if (!resolvedInstagramBusinessAccountId) {
    return null;
  }

  const pages = input.pages ?? [];
  const resolvedPageFromDiscovery =
    pages.find((page) => page.instagramBusinessAccountId === resolvedInstagramBusinessAccountId) ??
    null;
  const discoveredInstagramIds = asUniqueIds(pages.map((page) => page.instagramBusinessAccountId));
  const pageIdCandidate =
    input.selectedPageId?.trim() ||
    resolvedPageFromDiscovery?.pageId ||
    debugTargetIds.find(
      (targetId) =>
        targetId !== resolvedInstagramBusinessAccountId &&
        !discoveredInstagramIds.includes(targetId)
    ) ||
    "";
  const pageNameCandidate =
    resolvedPageFromDiscovery?.pageName || input.selectedPageName?.trim() || "";

  logResolverInfo("direct_instagram_asset_selected", {
    userId: input.userId,
    statePrefix: input.statePrefix,
    details: {
      pageId: pageIdCandidate,
      pageName: pageNameCandidate,
      instagramBusinessAccountId: resolvedInstagramBusinessAccountId,
    },
  });

  return {
    pageId: pageIdCandidate,
    pageName: pageNameCandidate,
    instagramBusinessAccountId: resolvedInstagramBusinessAccountId,
  };
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
  const linkedPages = getLinkedPages(pages);
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
      linkedPairs: linkedPages.map((page) => ({
        pageId: page.pageId,
        instagramBusinessAccountId: page.instagramBusinessAccountId,
        hasPageAccessToken: Boolean(page.pageAccessToken),
        linkSource: page.linkSource,
      })),
      candidatePairs: candidates.map((candidate) => ({
        pageId: candidate.pageId,
        instagramBusinessAccountId: candidate.instagramBusinessAccountId,
      })),
    },
  });

  if (linkedPages.length === 0) {
    const directSelection = await resolveDirectInstagramAssetSelection({
      longLivedUserToken: input.longLivedUserToken,
      pages,
      userId: input.userId,
      statePrefix: input.statePrefix,
    });
    if (directSelection) {
      const connection = await persistConnectedSelection({
        userId: input.userId,
        longLivedUserToken: input.longLivedUserToken,
        pageId: directSelection.pageId,
        pageName: directSelection.pageName,
        publishAccessToken: input.longLivedUserToken,
        instagramBusinessAccountId: directSelection.instagramBusinessAccountId,
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

    const connection = await markInstagramConnectionState(input.userId, {
      instagramUserAccessToken: encryptInstagramToken(input.longLivedUserToken),
      instagramAccessToken: "",
      ...buildSelectedPagePatch(null),
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

  if (candidates.length === 0) {
    const reconnectPage = linkedPages.length === 1 ? linkedPages[0] : null;
    const connection = await markInstagramConnectionState(input.userId, {
      instagramUserAccessToken: encryptInstagramToken(input.longLivedUserToken),
      instagramAccessToken: "",
      ...buildSelectedPagePatch(reconnectPage),
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

  if (candidates.length > 1) {
    const connection = await markInstagramConnectionState(input.userId, {
      instagramUserAccessToken: encryptInstagramToken(input.longLivedUserToken),
      instagramAccessToken: "",
      ...buildSelectedPagePatch(null),
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

  const connection = await persistConnectedSelection({
    userId: input.userId,
    longLivedUserToken: input.longLivedUserToken,
    pageId: candidate.pageId,
    pageName: candidate.pageName,
    publishAccessToken: pageAccessToken,
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

  if (!summary.selectedInstagramBusinessAccountId) {
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
    const linkedPages = getLinkedPages(pages);
    const candidates = pagesToCandidates(pages);
    const selectedPage = pages.find((page) => page.pageId === summary.selectedPageId);
    const selectedCandidate = candidates.find(
      (candidate) => candidate.pageId === summary.selectedPageId
    );

    if (!selectedCandidate) {
      const alternativeCandidates = candidates.filter(
        (candidate) => candidate.pageId !== summary.selectedPageId
      );
      const fallbackLinkedPages = linkedPages.filter(
        (page) => page.pageId !== summary.selectedPageId
      );

      if (alternativeCandidates.length > 0) {
        await markInstagramConnectionState(userId, {
          instagramConnectionStatus: "selection_required",
          instagramConnectionErrorCode: "",
          instagramCandidateAccounts: alternativeCandidates,
          instagramAccessToken: "",
          ...buildSelectedPagePatch(null),
        });
        return null;
      }

      if (selectedPage?.instagramBusinessAccountId || fallbackLinkedPages.length > 0) {
        const reconnectPage =
          selectedPage?.instagramBusinessAccountId
            ? selectedPage
            : fallbackLinkedPages.length === 1
              ? fallbackLinkedPages[0]
              : null;
        await markInstagramConnectionState(userId, {
          instagramConnectionStatus: "needs_reconnect",
          instagramConnectionErrorCode: "missing_page_access_token",
          instagramCandidateAccounts: [],
          instagramAccessToken: "",
          ...buildSelectedPagePatch(reconnectPage),
        });
        return null;
      }

      const directSelection = await resolveDirectInstagramAssetSelection({
        longLivedUserToken,
        pages,
        selectedPageId: summary.selectedPageId,
        selectedPageName: summary.selectedPageName,
        selectedInstagramBusinessAccountId: summary.selectedInstagramBusinessAccountId,
        userId,
      });
      if (directSelection) {
        const connection = await persistConnectedSelection({
          userId,
          longLivedUserToken,
          pageId: directSelection.pageId,
          pageName: directSelection.pageName || summary.selectedPageName,
          publishAccessToken: longLivedUserToken,
          instagramBusinessAccountId: directSelection.instagramBusinessAccountId,
          tokenExpiresAt: settings.instagramTokenExpiresAt ?? "",
        });
        return buildOauthCredentials({
          source: "oauth_derived_page_token",
          pageId: connection.selectedPageId,
          pageName: connection.selectedPageName,
          instagramBusinessAccountId: connection.selectedInstagramBusinessAccountId,
          publishAccessToken: longLivedUserToken,
          hasLongLivedUserToken: true,
        });
      }

      await markInstagramConnectionState(userId, {
        instagramConnectionStatus: "missing_page_linkage",
        instagramConnectionErrorCode: "missing_page_linkage",
        instagramAccessToken: "",
        instagramCandidateAccounts: [],
        ...buildSelectedPagePatch(null),
      });
      return null;
    }

    const selectedPageResolved =
      selectedPage ?? pages.find((page) => page.pageId === selectedCandidate.pageId);
    if (!selectedPageResolved?.pageAccessToken) {
      console.warn("[flowcart:instagram:resolver]", {
        stage: "selected_page_missing_access_token",
        userIdPrefix: userId.slice(0, 8),
        pageId: summary.selectedPageId,
      });
      await markInstagramConnectionState(userId, {
        instagramConnectionStatus: "needs_reconnect",
        instagramConnectionErrorCode: "missing_page_access_token",
        instagramAccessToken: "",
        instagramCandidateAccounts: [],
        ...buildSelectedPagePatch(selectedPageResolved ?? null),
      });
      return null;
    }

    await saveInstagramConnectionState(userId, {
      instagramAccessToken: encryptInstagramToken(selectedPageResolved.pageAccessToken),
      instagramBusinessAccountId: selectedCandidate.instagramBusinessAccountId,
      instagramPageName: selectedPageResolved.pageName || summary.selectedPageName,
      instagramConnectionStatus: "connected",
      instagramConnectionErrorCode: "",
      instagramLastValidatedAt: new Date().toISOString(),
      instagramCandidateAccounts: [],
    });

    return buildOauthCredentials({
      source: "oauth_derived_page_token",
      pageId: selectedCandidate.pageId,
      pageName: selectedPageResolved.pageName || summary.selectedPageName,
      instagramBusinessAccountId: selectedCandidate.instagramBusinessAccountId,
      publishAccessToken: selectedPageResolved.pageAccessToken,
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
    const linkedPages = getLinkedPages(pages);
    const candidates = pagesToCandidates(pages);

    if (!linkedPages.length) {
      const directSelection = await resolveDirectInstagramAssetSelection({
        longLivedUserToken,
        pages,
        selectedPageId: summary.selectedPageId,
        selectedPageName: summary.selectedPageName,
        selectedInstagramBusinessAccountId: summary.selectedInstagramBusinessAccountId,
        userId,
      });
      if (directSelection) {
        const connection = await persistConnectedSelection({
          userId,
          longLivedUserToken,
          pageId: directSelection.pageId,
          pageName: directSelection.pageName || summary.selectedPageName,
          publishAccessToken: longLivedUserToken,
          instagramBusinessAccountId: directSelection.instagramBusinessAccountId,
          tokenExpiresAt: settings.instagramTokenExpiresAt ?? "",
        });
        logPersistedConnection({
          stage: "validation_persisted",
          userId,
          connection,
        });
        return connection;
      }

      const connection = await markInstagramConnectionState(userId, {
        instagramConnectionStatus: "missing_page_linkage",
        instagramConnectionErrorCode: "missing_page_linkage",
        instagramAccessToken: "",
        ...buildSelectedPagePatch(null),
        instagramCandidateAccounts: [],
      });
      logPersistedConnection({
        stage: "validation_persisted",
        userId,
        connection,
      });
      return connection;
    }

    if (!summary.selectedPageId) {
      if ((summary.status === "selection_required" && candidates.length > 0) || candidates.length > 1) {
        const connection = await markInstagramConnectionState(userId, {
          instagramConnectionStatus: "selection_required",
          instagramConnectionErrorCode: "",
          instagramCandidateAccounts: candidates,
          instagramAccessToken: "",
          ...buildSelectedPagePatch(null),
        });
        logPersistedConnection({
          stage: "validation_persisted",
          userId,
          connection,
        });
        return connection;
      }

      if (!candidates.length) {
        const reconnectPage = linkedPages.length === 1 ? linkedPages[0] : null;
        const connection = await markInstagramConnectionState(userId, {
          instagramConnectionStatus: "needs_reconnect",
          instagramConnectionErrorCode: "missing_page_access_token",
          instagramCandidateAccounts: [],
          instagramAccessToken: "",
          ...buildSelectedPagePatch(reconnectPage),
        });
        logPersistedConnection({
          stage: "validation_persisted",
          userId,
          connection,
        });
        return connection;
      }
    }

    const selectedPageId =
      summary.selectedPageId || (candidates.length === 1 ? candidates[0]?.pageId ?? "" : "");
    const selectedPage = pages.find((page) => page.pageId === selectedPageId);
    const selectedCandidate = candidates.find((candidate) => candidate.pageId === selectedPageId);

    if (!selectedCandidate) {
      const alternativeCandidates = candidates.filter(
        (candidate) => candidate.pageId !== selectedPageId
      );
      const fallbackLinkedPages = linkedPages.filter((page) => page.pageId !== selectedPageId);

      if (alternativeCandidates.length > 0) {
        const connection = await markInstagramConnectionState(userId, {
          instagramConnectionStatus: "selection_required",
          instagramConnectionErrorCode: "",
          instagramCandidateAccounts: alternativeCandidates,
          instagramAccessToken: "",
          ...buildSelectedPagePatch(null),
        });
        logPersistedConnection({
          stage: "validation_persisted",
          userId,
          connection,
        });
        return connection;
      }

      if (selectedPage?.instagramBusinessAccountId || fallbackLinkedPages.length > 0) {
        logResolverWarn("selected_page_missing_access_token", {
          userId,
          details: {
            pageId: selectedPageId,
          },
        });
        const reconnectPage =
          selectedPage?.instagramBusinessAccountId
            ? selectedPage
            : fallbackLinkedPages.length === 1
              ? fallbackLinkedPages[0]
              : null;
        const connection = await markInstagramConnectionState(userId, {
          instagramConnectionStatus: "needs_reconnect",
          instagramConnectionErrorCode: "missing_page_access_token",
          instagramCandidateAccounts: [],
          instagramAccessToken: "",
          ...buildSelectedPagePatch(reconnectPage),
        });
        logPersistedConnection({
          stage: "validation_persisted",
          userId,
          connection,
        });
        return connection;
      }

      const connection = await markInstagramConnectionState(userId, {
        instagramConnectionStatus: "missing_page_linkage",
        instagramConnectionErrorCode: "missing_page_linkage",
        instagramCandidateAccounts: [],
        instagramAccessToken: "",
        ...buildSelectedPagePatch(null),
      });
      logPersistedConnection({
        stage: "validation_persisted",
        userId,
        connection,
      });
      return connection;
    }

    const connection = await persistConnectedSelection({
      userId,
      longLivedUserToken,
      pageId: selectedPageId,
      pageName:
        selectedCandidate.pageName || selectedPage?.pageName || summary.selectedPageName,
      publishAccessToken: selectedPage?.pageAccessToken ?? "",
      instagramBusinessAccountId: selectedCandidate.instagramBusinessAccountId,
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

  return persistConnectedSelection({
    userId: input.userId,
    longLivedUserToken,
    pageId: candidate.pageId,
    pageName: selectedPage.pageName || candidate.pageName,
    publishAccessToken: selectedPage.pageAccessToken,
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
