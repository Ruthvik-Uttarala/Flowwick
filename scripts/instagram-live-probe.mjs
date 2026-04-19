import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { envValue } from "./env.mjs";

const META_GRAPH_API_VERSION = "v21.0";

function parseArgs(argv) {
  const args = {
    userId: "",
    selectedPageId: "",
    selectedInstagramId: "",
    minutes: 30,
  };

  for (const arg of argv) {
    if (arg.startsWith("--user-id=")) {
      args.userId = arg.slice("--user-id=".length).trim();
    } else if (arg.startsWith("--selected-page-id=")) {
      args.selectedPageId = arg.slice("--selected-page-id=".length).trim();
    } else if (arg.startsWith("--selected-instagram-id=")) {
      args.selectedInstagramId = arg.slice("--selected-instagram-id=".length).trim();
    } else if (arg.startsWith("--minutes=")) {
      const value = Number.parseInt(arg.slice("--minutes=".length), 10);
      if (Number.isFinite(value) && value > 0) {
        args.minutes = value;
      }
    }
  }

  return args;
}

function asTrimmedString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeUniqueIds(values) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function decodeBase64Url(input) {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const padding = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
  return Buffer.from(`${normalized}${padding}`, "base64").toString("utf8");
}

function deriveSupabaseUrl(serviceRoleKey) {
  const parts = serviceRoleKey.split(".");
  if (parts.length < 2) {
    return "";
  }

  try {
    const payload = JSON.parse(decodeBase64Url(parts[1]));
    const issuer = asTrimmedString(payload.iss);
    if (!issuer) {
      return "";
    }
    return issuer.replace(/\/auth\/v1\/?$/i, "");
  } catch {
    return "";
  }
}

function decryptInstagramToken(value, secret) {
  const trimmed = asTrimmedString(value);
  if (!trimmed) return "";
  if (!trimmed.startsWith("v1:")) return trimmed;

  const [, ivBase64, tagBase64, payloadBase64] = trimmed.split(":");
  if (!ivBase64 || !tagBase64 || !payloadBase64) {
    throw new Error("Stored Instagram token is malformed.");
  }

  const key = crypto.createHash("sha256").update(secret, "utf8").digest();
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(ivBase64, "base64")
  );
  decipher.setAuthTag(Buffer.from(tagBase64, "base64"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(payloadBase64, "base64")),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}

async function probeGraphJson({ path, searchParams }) {
  const url = new URL(`https://graph.facebook.com/${META_GRAPH_API_VERSION}/${path}`);
  url.search = searchParams.toString();

  try {
    const response = await fetch(url);
    const body = await response.json().catch(() => null);
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

function extractDebugTargetIds(payload) {
  const data = payload?.data;
  if (!data || typeof data !== "object") {
    return [];
  }

  const targetIds = [];
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

function extractAccountsState(payload) {
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
    accounts,
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
  };
}

function extractPageLookupState(payload) {
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

function extractInstagramAccountsEdgeState(payload) {
  const data = Array.isArray(payload?.data) ? payload.data : [];
  return {
    instagramIds: normalizeUniqueIds(data.map((entry) => asTrimmedString(entry.id))),
  };
}

function extractInstagramAccountLookupState(payload) {
  return {
    instagramIds: normalizeUniqueIds([asTrimmedString(payload?.id)]),
  };
}

function buildProbeSummary({
  probe,
  path,
  status,
  selectedPageId,
  selectedInstagramId,
  targetIds = [],
  pageIds = [],
  instagramIds = [],
  hasAnyPageAccessToken = false,
  hasInstagramBusinessAccount = false,
  hasConnectedInstagramAccount = false,
}) {
  const normalizedTargetIds = normalizeUniqueIds(targetIds);
  const normalizedPageIds = normalizeUniqueIds(pageIds);
  const normalizedInstagramIds = normalizeUniqueIds(instagramIds);

  return {
    probe,
    path,
    status,
    selectedPageReachable: Boolean(
      selectedPageId &&
        (normalizedPageIds.includes(selectedPageId) ||
          normalizedTargetIds.includes(selectedPageId))
    ),
    selectedInstagramReachable: Boolean(
      selectedInstagramId &&
        (normalizedInstagramIds.includes(selectedInstagramId) ||
          normalizedTargetIds.includes(selectedInstagramId))
    ),
    hasAnyPageAccessToken: Boolean(hasAnyPageAccessToken),
    hasInstagramBusinessAccount: Boolean(hasInstagramBusinessAccount),
    hasConnectedInstagramAccount: Boolean(hasConnectedInstagramAccount),
    targetIds: normalizedTargetIds,
    pageIds: normalizedPageIds,
    instagramIds: normalizedInstagramIds,
  };
}

async function runProbe({ userAccessToken, appId, appSecret, selectedPageId, selectedInstagramId }) {
  const probes = [];

  const me = await probeGraphJson({
    path: "me",
    searchParams: new URLSearchParams({
      fields: "id,name",
      access_token: userAccessToken,
    }),
  });
  probes.push(
    buildProbeSummary({
      probe: "me",
      path: "/me?fields=id,name",
      status: me.status,
      selectedPageId,
      selectedInstagramId,
    })
  );

  const permissions = await probeGraphJson({
    path: "me/permissions",
    searchParams: new URLSearchParams({
      access_token: userAccessToken,
    }),
  });
  probes.push(
    buildProbeSummary({
      probe: "permissions",
      path: "/me/permissions",
      status: permissions.status,
      selectedPageId,
      selectedInstagramId,
    })
  );

  let debugTargetIds = [];
  if (appId && appSecret) {
    const debugToken = await probeGraphJson({
      path: "debug_token",
      searchParams: new URLSearchParams({
        input_token: userAccessToken,
        access_token: `${appId}|${appSecret}`,
      }),
    });
    debugTargetIds = extractDebugTargetIds(debugToken.body);
    probes.push(
      buildProbeSummary({
        probe: "debug_token",
        path: "/debug_token",
        status: debugToken.status,
        selectedPageId,
        selectedInstagramId,
        targetIds: debugTargetIds,
      })
    );
  }

  const meAccounts = await probeGraphJson({
    path: "me/accounts",
    searchParams: new URLSearchParams({
      fields:
        "id,name,access_token,tasks,instagram_business_account{id},connected_instagram_account{id}",
      access_token: userAccessToken,
    }),
  });
  const accountsState = extractAccountsState(meAccounts.body);

  let effectiveSelectedPageId = selectedPageId;
  if (!effectiveSelectedPageId) {
    effectiveSelectedPageId =
      accountsState.accounts.find((entry) => debugTargetIds.includes(entry.pageId))?.pageId ?? "";
  }

  let effectiveSelectedInstagramId = selectedInstagramId;
  if (!effectiveSelectedInstagramId) {
    const matchingAccount = accountsState.accounts.find(
      (entry) =>
        debugTargetIds.includes(entry.instagramBusinessAccountId) ||
        debugTargetIds.includes(entry.connectedInstagramAccountId)
    );
    effectiveSelectedInstagramId =
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
      selectedPageId: effectiveSelectedPageId,
      selectedInstagramId: effectiveSelectedInstagramId,
      targetIds: debugTargetIds,
      pageIds: accountsState.pageIds,
      instagramIds: accountsState.instagramIds,
      hasAnyPageAccessToken: accountsState.hasAnyPageAccessToken,
      hasInstagramBusinessAccount: accountsState.hasInstagramBusinessAccount,
      hasConnectedInstagramAccount: accountsState.hasConnectedInstagramAccount,
    })
  );

  const pageIdsToProbe =
    effectiveSelectedPageId || accountsState.pageIds.length === 0
      ? normalizeUniqueIds([effectiveSelectedPageId])
      : accountsState.pageIds;
  const instagramIdsFromPageProbes = [];

  for (const pageId of pageIdsToProbe) {
    if (!pageId) {
      continue;
    }

    const pageLookup = await probeGraphJson({
      path: pageId,
      searchParams: new URLSearchParams({
        fields: "id,name,tasks,instagram_business_account{id},connected_instagram_account{id}",
        access_token: userAccessToken,
      }),
    });
    const pageState = extractPageLookupState(pageLookup.body);
    instagramIdsFromPageProbes.push(...pageState.instagramIds);
    probes.push(
      buildProbeSummary({
        probe: "page_lookup",
        path: `/${pageId}?fields=id,name,tasks,instagram_business_account{id},connected_instagram_account{id}`,
        status: pageLookup.status,
        selectedPageId: effectiveSelectedPageId,
        selectedInstagramId: effectiveSelectedInstagramId,
        targetIds: debugTargetIds,
        pageIds: pageState.pageIds,
        instagramIds: pageState.instagramIds,
        hasInstagramBusinessAccount: pageState.hasInstagramBusinessAccount,
        hasConnectedInstagramAccount: pageState.hasConnectedInstagramAccount,
      })
    );

    const pageInstagramAccounts = await probeGraphJson({
      path: `${pageId}/instagram_accounts`,
      searchParams: new URLSearchParams({
        fields: "id,username",
        access_token: userAccessToken,
      }),
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
        selectedPageId: effectiveSelectedPageId,
        selectedInstagramId: effectiveSelectedInstagramId,
        targetIds: debugTargetIds,
        pageIds: [pageId],
        instagramIds: pageInstagramAccountsState.instagramIds,
      })
    );
  }

  if (!effectiveSelectedInstagramId) {
    effectiveSelectedInstagramId =
      normalizeUniqueIds([...accountsState.instagramIds, ...instagramIdsFromPageProbes]).find(
        (instagramId) => debugTargetIds.includes(instagramId)
      ) ?? "";
  }

  if (effectiveSelectedInstagramId) {
    const instagramLookup = await probeGraphJson({
      path: effectiveSelectedInstagramId,
      searchParams: new URLSearchParams({
        fields: "id,username",
        access_token: userAccessToken,
      }),
    });
    const instagramLookupState = extractInstagramAccountLookupState(instagramLookup.body);
    probes.push(
      buildProbeSummary({
        probe: "instagram_lookup",
        path: `/${effectiveSelectedInstagramId}?fields=id,username`,
        status: instagramLookup.status,
        selectedPageId: effectiveSelectedPageId,
        selectedInstagramId: effectiveSelectedInstagramId,
        targetIds: debugTargetIds,
        instagramIds: instagramLookupState.instagramIds,
      })
    );

    const selectedAccount = accountsState.accounts.find(
      (entry) => entry.pageId === effectiveSelectedPageId
    );
    if (selectedAccount?.pageAccessToken) {
      const instagramLookupViaPageToken = await probeGraphJson({
        path: effectiveSelectedInstagramId,
        searchParams: new URLSearchParams({
          fields: "id,username",
          access_token: selectedAccount.pageAccessToken,
        }),
      });
      const instagramLookupViaPageTokenState = extractInstagramAccountLookupState(
        instagramLookupViaPageToken.body
      );
      probes.push(
        buildProbeSummary({
          probe: "instagram_lookup_via_page_token",
          path: `/${effectiveSelectedInstagramId}?fields=id,username (page token)`,
          status: instagramLookupViaPageToken.status,
          selectedPageId: effectiveSelectedPageId,
          selectedInstagramId: effectiveSelectedInstagramId,
          targetIds: debugTargetIds,
          pageIds: effectiveSelectedPageId ? [effectiveSelectedPageId] : [],
          instagramIds: instagramLookupViaPageTokenState.instagramIds,
          hasAnyPageAccessToken: true,
        })
      );
    }
  }

  return {
    selectedPageId: effectiveSelectedPageId,
    selectedInstagramId: effectiveSelectedInstagramId,
    targetIds: debugTargetIds,
    probes,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const serviceRoleKey = await envValue("SUPABASE_SERVICE_ROLE_KEY");
  const encryptionKey = await envValue("META_TOKEN_ENCRYPTION_KEY");
  const appId = await envValue("META_APP_ID");
  const appSecret = await envValue("META_APP_SECRET");

  if (!serviceRoleKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is required.");
  }
  if (!encryptionKey) {
    throw new Error("META_TOKEN_ENCRYPTION_KEY is required.");
  }

  const supabaseUrl =
    (await envValue("NEXT_PUBLIC_SUPABASE_URL")) || deriveSupabaseUrl(serviceRoleKey);
  if (!supabaseUrl) {
    throw new Error(
      "Supabase URL is required. Set NEXT_PUBLIC_SUPABASE_URL or use a service-role key with an issuer."
    );
  }

  const client = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let query = client
    .from("integration_settings")
    .select(
      "user_id,updated_at,instagram_user_access_token,instagram_page_id,instagram_business_account_id,instagram_connection_status,instagram_connection_error_code"
    )
    .neq("instagram_user_access_token", "")
    .order("updated_at", { ascending: false });

  if (args.userId) {
    query = query.eq("user_id", args.userId).limit(1);
  } else {
    const since = new Date(Date.now() - args.minutes * 60 * 1000).toISOString();
    query = query.gte("updated_at", since).limit(10);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(`Failed to load integration settings: ${error.message}`);
  }

  const rows = Array.isArray(data) ? data : [];
  if (rows.length === 0) {
    throw new Error("No Instagram OAuth rows found for the requested time window.");
  }

  const row = rows[0];
  const decryptedUserToken = decryptInstagramToken(
    asTrimmedString(row.instagram_user_access_token),
    encryptionKey
  );
  const report = await runProbe({
    userAccessToken: decryptedUserToken,
    appId,
    appSecret,
    selectedPageId: args.selectedPageId || asTrimmedString(row.instagram_page_id),
    selectedInstagramId:
      args.selectedInstagramId || asTrimmedString(row.instagram_business_account_id),
  });

  const output = {
    row: {
      userIdPrefix: asTrimmedString(row.user_id).slice(0, 8),
      updatedAt: asTrimmedString(row.updated_at),
      status: asTrimmedString(row.instagram_connection_status),
      errorCode: asTrimmedString(row.instagram_connection_error_code),
      storedSelectedPageId: asTrimmedString(row.instagram_page_id),
      storedSelectedInstagramId: asTrimmedString(row.instagram_business_account_id),
    },
    recentRows:
      args.userId || rows.length <= 1
        ? []
        : rows.slice(0, 5).map((entry) => ({
            userIdPrefix: asTrimmedString(entry.user_id).slice(0, 8),
            updatedAt: asTrimmedString(entry.updated_at),
            status: asTrimmedString(entry.instagram_connection_status),
            errorCode: asTrimmedString(entry.instagram_connection_error_code),
            storedSelectedPageId: asTrimmedString(entry.instagram_page_id),
            storedSelectedInstagramId: asTrimmedString(entry.instagram_business_account_id),
          })),
    report,
  };

  console.log(JSON.stringify(output, null, 2));
}

main().catch((error) => {
  console.error(
    JSON.stringify(
      {
        error: error instanceof Error ? error.message : "Unknown probe error.",
      },
      null,
      2
    )
  );
  process.exitCode = 1;
});
