import { META_GRAPH_API_VERSION } from "@/src/lib/server/instagram";

interface GraphProbeResponse<T> {
  status: number;
  body: T | null;
}

interface DebugTokenResponse {
  data?: {
    profile_id?: unknown;
    granular_scopes?: Array<{
      target_ids?: unknown;
    }>;
  };
}

interface MeAccountsResponse {
  data?: Array<{
    id?: unknown;
    access_token?: unknown;
    instagram_business_account?: {
      id?: unknown;
    };
    connected_instagram_account?: {
      id?: unknown;
    };
  }>;
}

interface PageLookupResponse {
  id?: unknown;
  instagram_business_account?: {
    id?: unknown;
  };
  connected_instagram_account?: {
    id?: unknown;
  };
}

interface PageInstagramAccountsResponse {
  data?: Array<{
    id?: unknown;
  }>;
}

interface InstagramAccountLookupResponse {
  id?: unknown;
}

export interface InstagramGraphProbeSummary {
  probe: string;
  path: string;
  status: number;
  selectedPageReachable: boolean;
  selectedInstagramReachable: boolean;
  hasAnyPageAccessToken: boolean;
  hasInstagramBusinessAccount: boolean;
  hasConnectedInstagramAccount: boolean;
  targetIds: string[];
  pageIds: string[];
  instagramIds: string[];
}

export interface InstagramGraphProbeReport {
  selectedPageId: string;
  selectedInstagramId: string;
  targetIds: string[];
  probes: InstagramGraphProbeSummary[];
}

function asTrimmedString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeUniqueIds(values: Iterable<string>): string[] {
  const seen = new Set<string>();
  for (const value of values) {
    const trimmed = value.trim();
    if (trimmed) {
      seen.add(trimmed);
    }
  }
  return [...seen];
}

async function probeGraphJson<T>(input: {
  path: string;
  searchParams: URLSearchParams;
  fetchFn?: typeof fetch;
}): Promise<GraphProbeResponse<T>> {
  const fetchFn = input.fetchFn ?? fetch;
  const url = new URL(`https://graph.facebook.com/${META_GRAPH_API_VERSION}/${input.path}`);
  url.search = input.searchParams.toString();

  try {
    const response = await fetchFn(url);
    const body = (await response.json().catch(() => null)) as T | null;
    return {
      status: response.status,
      body,
    };
  } catch {
    return {
      status: 0,
      body: null,
    };
  }
}

function extractDebugTargetIds(payload: DebugTokenResponse | null): string[] {
  const data = payload?.data;
  if (!data || typeof data !== "object") {
    return [];
  }

  const targetIds: string[] = [];
  const profileId = asTrimmedString(data.profile_id);
  if (profileId) {
    targetIds.push(profileId);
  }

  const granularScopes = Array.isArray(data.granular_scopes) ? data.granular_scopes : [];
  for (const scope of granularScopes) {
    const scopeTargetIds = Array.isArray(scope?.target_ids) ? scope.target_ids : [];
    for (const value of scopeTargetIds) {
      const targetId = asTrimmedString(value);
      if (targetId) {
        targetIds.push(targetId);
      }
    }
  }

  return normalizeUniqueIds(targetIds);
}

function extractAccountsState(payload: MeAccountsResponse | null): {
  pageIds: string[];
  instagramIds: string[];
  hasAnyPageAccessToken: boolean;
  hasInstagramBusinessAccount: boolean;
  hasConnectedInstagramAccount: boolean;
  accounts: Array<{
    pageId: string;
    pageAccessToken: string;
    instagramBusinessAccountId: string;
    connectedInstagramAccountId: string;
  }>;
} {
  const data = Array.isArray(payload?.data) ? payload.data : [];
  const accounts = data.flatMap((entry) => {
    const pageId = asTrimmedString(entry.id);
    if (!pageId) {
      return [];
    }

    return [
      {
        pageId,
        pageAccessToken: asTrimmedString(entry.access_token),
        instagramBusinessAccountId: asTrimmedString(entry.instagram_business_account?.id),
        connectedInstagramAccountId: asTrimmedString(entry.connected_instagram_account?.id),
      },
    ];
  });

  return {
    pageIds: normalizeUniqueIds(accounts.map((entry) => entry.pageId)),
    instagramIds: normalizeUniqueIds(
      accounts.flatMap((entry) => [
        entry.instagramBusinessAccountId,
        entry.connectedInstagramAccountId,
      ])
    ),
    hasAnyPageAccessToken: accounts.some((entry) => Boolean(entry.pageAccessToken)),
    hasInstagramBusinessAccount: accounts.some((entry) => Boolean(entry.instagramBusinessAccountId)),
    hasConnectedInstagramAccount: accounts.some(
      (entry) => Boolean(entry.connectedInstagramAccountId)
    ),
    accounts,
  };
}

function extractPageLookupState(payload: PageLookupResponse | null): {
  pageIds: string[];
  instagramIds: string[];
  hasInstagramBusinessAccount: boolean;
  hasConnectedInstagramAccount: boolean;
} {
  const pageId = asTrimmedString(payload?.id);
  const instagramBusinessAccountId = asTrimmedString(payload?.instagram_business_account?.id);
  const connectedInstagramAccountId = asTrimmedString(payload?.connected_instagram_account?.id);

  return {
    pageIds: normalizeUniqueIds([pageId]),
    instagramIds: normalizeUniqueIds([
      instagramBusinessAccountId,
      connectedInstagramAccountId,
    ]),
    hasInstagramBusinessAccount: Boolean(instagramBusinessAccountId),
    hasConnectedInstagramAccount: Boolean(connectedInstagramAccountId),
  };
}

function extractInstagramAccountsEdgeState(payload: PageInstagramAccountsResponse | null): {
  instagramIds: string[];
} {
  const accounts = Array.isArray(payload?.data) ? payload.data : [];
  return {
    instagramIds: normalizeUniqueIds(accounts.map((entry) => asTrimmedString(entry.id))),
  };
}

function extractInstagramAccountLookupState(payload: InstagramAccountLookupResponse | null): {
  instagramIds: string[];
} {
  return {
    instagramIds: normalizeUniqueIds([asTrimmedString(payload?.id)]),
  };
}

function buildProbeSummary(input: {
  probe: string;
  path: string;
  status: number;
  selectedPageId: string;
  selectedInstagramId: string;
  targetIds?: string[];
  pageIds?: string[];
  instagramIds?: string[];
  hasAnyPageAccessToken?: boolean;
  hasInstagramBusinessAccount?: boolean;
  hasConnectedInstagramAccount?: boolean;
}): InstagramGraphProbeSummary {
  const targetIds = normalizeUniqueIds(input.targetIds ?? []);
  const pageIds = normalizeUniqueIds(input.pageIds ?? []);
  const instagramIds = normalizeUniqueIds(input.instagramIds ?? []);

  return {
    probe: input.probe,
    path: input.path,
    status: input.status,
    selectedPageReachable: Boolean(
      input.selectedPageId &&
        (pageIds.includes(input.selectedPageId) || targetIds.includes(input.selectedPageId))
    ),
    selectedInstagramReachable: Boolean(
      input.selectedInstagramId &&
        (instagramIds.includes(input.selectedInstagramId) ||
          targetIds.includes(input.selectedInstagramId))
    ),
    hasAnyPageAccessToken: Boolean(input.hasAnyPageAccessToken),
    hasInstagramBusinessAccount: Boolean(input.hasInstagramBusinessAccount),
    hasConnectedInstagramAccount: Boolean(input.hasConnectedInstagramAccount),
    targetIds,
    pageIds,
    instagramIds,
  };
}

export async function runInstagramGraphProbe(input: {
  userAccessToken: string;
  appId?: string;
  appSecret?: string;
  selectedPageId?: string;
  selectedInstagramId?: string;
  fetchFn?: typeof fetch;
}): Promise<InstagramGraphProbeReport> {
  const userAccessToken = input.userAccessToken.trim();
  const appId = input.appId?.trim() ?? "";
  const appSecret = input.appSecret?.trim() ?? "";
  const probes: InstagramGraphProbeSummary[] = [];

  const me = await probeGraphJson<Record<string, unknown>>({
    path: "me",
    searchParams: new URLSearchParams({
      fields: "id,name",
      access_token: userAccessToken,
    }),
    fetchFn: input.fetchFn,
  });
  probes.push(
    buildProbeSummary({
      probe: "me",
      path: "/me?fields=id,name",
      status: me.status,
      selectedPageId: input.selectedPageId?.trim() ?? "",
      selectedInstagramId: input.selectedInstagramId?.trim() ?? "",
    })
  );

  const permissions = await probeGraphJson<Record<string, unknown>>({
    path: "me/permissions",
    searchParams: new URLSearchParams({
      access_token: userAccessToken,
    }),
    fetchFn: input.fetchFn,
  });
  probes.push(
    buildProbeSummary({
      probe: "permissions",
      path: "/me/permissions",
      status: permissions.status,
      selectedPageId: input.selectedPageId?.trim() ?? "",
      selectedInstagramId: input.selectedInstagramId?.trim() ?? "",
    })
  );

  let debugTargetIds: string[] = [];
  if (appId && appSecret) {
    const debugToken = await probeGraphJson<DebugTokenResponse>({
      path: "debug_token",
      searchParams: new URLSearchParams({
        input_token: userAccessToken,
        access_token: `${appId}|${appSecret}`,
      }),
      fetchFn: input.fetchFn,
    });
    debugTargetIds = extractDebugTargetIds(debugToken.body);
    probes.push(
      buildProbeSummary({
        probe: "debug_token",
        path: "/debug_token",
        status: debugToken.status,
        selectedPageId: input.selectedPageId?.trim() ?? "",
        selectedInstagramId: input.selectedInstagramId?.trim() ?? "",
        targetIds: debugTargetIds,
      })
    );
  }

  const meAccounts = await probeGraphJson<MeAccountsResponse>({
    path: "me/accounts",
    searchParams: new URLSearchParams({
      fields:
        "id,name,access_token,tasks,instagram_business_account{id},connected_instagram_account{id}",
      access_token: userAccessToken,
    }),
    fetchFn: input.fetchFn,
  });
  const accountsState = extractAccountsState(meAccounts.body);

  let selectedPageId = input.selectedPageId?.trim() ?? "";
  if (!selectedPageId) {
    selectedPageId =
      accountsState.accounts.find((entry) => debugTargetIds.includes(entry.pageId))?.pageId ?? "";
  }

  let selectedInstagramId = input.selectedInstagramId?.trim() ?? "";
  if (!selectedInstagramId) {
    const matchingAccount = accountsState.accounts.find(
      (entry) =>
        debugTargetIds.includes(entry.instagramBusinessAccountId) ||
        debugTargetIds.includes(entry.connectedInstagramAccountId)
    );
    selectedInstagramId =
      matchingAccount?.instagramBusinessAccountId ||
      matchingAccount?.connectedInstagramAccountId ||
      "";
  }

  probes.push(
    buildProbeSummary({
      probe: "accounts",
      path:
        "/me/accounts?fields=id,name,access_token,tasks,instagram_business_account{id},connected_instagram_account{id}",
      status: meAccounts.status,
      selectedPageId,
      selectedInstagramId,
      targetIds: debugTargetIds,
      pageIds: accountsState.pageIds,
      instagramIds: accountsState.instagramIds,
      hasAnyPageAccessToken: accountsState.hasAnyPageAccessToken,
      hasInstagramBusinessAccount: accountsState.hasInstagramBusinessAccount,
      hasConnectedInstagramAccount: accountsState.hasConnectedInstagramAccount,
    })
  );

  const pageIdsToProbe =
    selectedPageId || accountsState.pageIds.length === 0
      ? normalizeUniqueIds([selectedPageId])
      : accountsState.pageIds;
  const instagramIdsFromPageProbes: string[] = [];

  for (const pageId of pageIdsToProbe) {
    if (!pageId) {
      continue;
    }

    const pageLookup = await probeGraphJson<PageLookupResponse>({
      path: pageId,
      searchParams: new URLSearchParams({
        fields: "id,name,tasks,instagram_business_account{id},connected_instagram_account{id}",
        access_token: userAccessToken,
      }),
      fetchFn: input.fetchFn,
    });
    const pageState = extractPageLookupState(pageLookup.body);
    instagramIdsFromPageProbes.push(...pageState.instagramIds);
    probes.push(
      buildProbeSummary({
        probe: "page_lookup",
        path: `/${pageId}?fields=id,name,tasks,instagram_business_account{id},connected_instagram_account{id}`,
        status: pageLookup.status,
        selectedPageId,
        selectedInstagramId,
        targetIds: debugTargetIds,
        pageIds: pageState.pageIds,
        instagramIds: pageState.instagramIds,
        hasInstagramBusinessAccount: pageState.hasInstagramBusinessAccount,
        hasConnectedInstagramAccount: pageState.hasConnectedInstagramAccount,
      })
    );

    const pageInstagramAccounts = await probeGraphJson<PageInstagramAccountsResponse>({
      path: `${pageId}/instagram_accounts`,
      searchParams: new URLSearchParams({
        fields: "id,username",
        access_token: userAccessToken,
      }),
      fetchFn: input.fetchFn,
    });
    const pageInstagramAccountsState = extractInstagramAccountsEdgeState(
      pageInstagramAccounts.body
    );
    instagramIdsFromPageProbes.push(...pageInstagramAccountsState.instagramIds);
    probes.push(
      buildProbeSummary({
        probe: "page_instagram_accounts",
        path: `/${pageId}/instagram_accounts?fields=id,username`,
        status: pageInstagramAccounts.status,
        selectedPageId,
        selectedInstagramId,
        targetIds: debugTargetIds,
        pageIds: [pageId],
        instagramIds: pageInstagramAccountsState.instagramIds,
      })
    );
  }

  if (!selectedInstagramId) {
    selectedInstagramId =
      normalizeUniqueIds([...accountsState.instagramIds, ...instagramIdsFromPageProbes]).find(
        (instagramId) => debugTargetIds.includes(instagramId)
      ) ?? "";
  }

  if (selectedInstagramId) {
    const instagramLookup = await probeGraphJson<InstagramAccountLookupResponse>({
      path: selectedInstagramId,
      searchParams: new URLSearchParams({
        fields: "id,username",
        access_token: userAccessToken,
      }),
      fetchFn: input.fetchFn,
    });
    const instagramLookupState = extractInstagramAccountLookupState(instagramLookup.body);
    probes.push(
      buildProbeSummary({
        probe: "instagram_lookup",
        path: `/${selectedInstagramId}?fields=id,username`,
        status: instagramLookup.status,
        selectedPageId,
        selectedInstagramId,
        targetIds: debugTargetIds,
        instagramIds: instagramLookupState.instagramIds,
      })
    );

    const selectedAccount = accountsState.accounts.find((entry) => entry.pageId === selectedPageId);
    if (selectedAccount?.pageAccessToken) {
      const instagramLookupViaPageToken = await probeGraphJson<InstagramAccountLookupResponse>({
        path: selectedInstagramId,
        searchParams: new URLSearchParams({
          fields: "id,username",
          access_token: selectedAccount.pageAccessToken,
        }),
        fetchFn: input.fetchFn,
      });
      const instagramLookupViaPageTokenState = extractInstagramAccountLookupState(
        instagramLookupViaPageToken.body
      );
      probes.push(
        buildProbeSummary({
          probe: "instagram_lookup_via_page_token",
          path: `/${selectedInstagramId}?fields=id,username (page token)`,
          status: instagramLookupViaPageToken.status,
          selectedPageId,
          selectedInstagramId,
          targetIds: debugTargetIds,
          pageIds: selectedPageId ? [selectedPageId] : [],
          instagramIds: instagramLookupViaPageTokenState.instagramIds,
          hasAnyPageAccessToken: true,
        })
      );
    }
  }

  return {
    selectedPageId,
    selectedInstagramId,
    targetIds: debugTargetIds,
    probes,
  };
}
