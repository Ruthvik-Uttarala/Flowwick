import {
  ConnectionSettings,
  InstagramCandidateAccount,
  InstagramConnectionStatus,
} from "@/src/lib/types";
import { getSupabaseServiceClient } from "@/src/lib/supabase/server-client";
import { normalizeStoreDomain } from "@/src/lib/server/runtime";
import { SECRET_MASK } from "@/src/lib/server/settings";

const TABLE = "integration_settings" as const;

const DEFAULT_SETTINGS: ConnectionSettings = {
  shopifyStoreDomain: "",
  shopifyAdminToken: "",
  instagramAccessToken: "",
  instagramBusinessAccountId: "",
  instagramUserAccessToken: "",
  instagramPageId: "",
  instagramPageName: "",
  instagramConnectionStatus: "disconnected",
  instagramConnectionErrorCode: "",
  instagramLastValidatedAt: "",
  instagramTokenExpiresAt: "",
  instagramCandidateAccounts: [],
};

interface DbSettingsRow {
  id: string;
  user_id: string;
  shopify_store_domain: string;
  shopify_admin_token: string;
  shopify_client_id?: string;
  shopify_client_secret?: string;
  instagram_access_token: string;
  instagram_business_account_id: string;
  instagram_user_access_token?: string;
  instagram_page_id?: string;
  instagram_page_name?: string;
  instagram_connection_status?: string;
  instagram_connection_error_code?: string;
  instagram_last_validated_at?: string | null;
  instagram_token_expires_at?: string | null;
  instagram_candidate_accounts?: unknown;
  created_at: string;
  updated_at: string;
}

export interface InstagramConnectionStatePatch {
  instagramAccessToken?: string;
  instagramBusinessAccountId?: string;
  instagramUserAccessToken?: string;
  instagramPageId?: string;
  instagramPageName?: string;
  instagramConnectionStatus?: InstagramConnectionStatus;
  instagramConnectionErrorCode?: string;
  instagramLastValidatedAt?: string;
  instagramTokenExpiresAt?: string;
  instagramCandidateAccounts?: InstagramCandidateAccount[];
}

function normalizeInstagramCandidateAccounts(value: unknown): InstagramCandidateAccount[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((candidate) => {
    if (!candidate || typeof candidate !== "object") return [];
    const record = candidate as Record<string, unknown>;
    const pageId = typeof record.pageId === "string" ? record.pageId.trim() : "";
    const pageName = typeof record.pageName === "string" ? record.pageName.trim() : "";
    const instagramBusinessAccountId =
      typeof record.instagramBusinessAccountId === "string"
        ? record.instagramBusinessAccountId.trim()
        : "";

    if (!pageId || !instagramBusinessAccountId) {
      return [];
    }

    return [
      {
        pageId,
        pageName,
        instagramBusinessAccountId,
      },
    ];
  });
}

function normalizeInstagramConnectionStatus(value: string | undefined): InstagramConnectionStatus {
  switch (value) {
    case "connected":
    case "needs_reconnect":
    case "invalid_expired_token":
    case "missing_page_linkage":
    case "missing_instagram_business_account":
    case "selection_required":
    case "legacy_fallback":
      return value;
    default:
      return "disconnected";
  }
}

function rowToSettings(row: DbSettingsRow): ConnectionSettings {
  return {
    shopifyStoreDomain: row.shopify_store_domain ?? "",
    shopifyAdminToken: row.shopify_admin_token ?? "",
    instagramAccessToken: row.instagram_access_token ?? "",
    instagramBusinessAccountId: row.instagram_business_account_id ?? "",
    instagramUserAccessToken: row.instagram_user_access_token ?? "",
    instagramPageId: row.instagram_page_id ?? "",
    instagramPageName: row.instagram_page_name ?? "",
    instagramConnectionStatus: normalizeInstagramConnectionStatus(
      row.instagram_connection_status
    ),
    instagramConnectionErrorCode: row.instagram_connection_error_code ?? "",
    instagramLastValidatedAt: row.instagram_last_validated_at ?? "",
    instagramTokenExpiresAt: row.instagram_token_expires_at ?? "",
    instagramCandidateAccounts: normalizeInstagramCandidateAccounts(
      row.instagram_candidate_accounts
    ),
  };
}

function buildDbRow(userId: string, settings: ConnectionSettings) {
  return {
    user_id: userId,
    shopify_store_domain: settings.shopifyStoreDomain,
    shopify_admin_token: settings.shopifyAdminToken,
    instagram_access_token: settings.instagramAccessToken,
    instagram_business_account_id: settings.instagramBusinessAccountId,
    instagram_user_access_token: settings.instagramUserAccessToken ?? "",
    instagram_page_id: settings.instagramPageId ?? "",
    instagram_page_name: settings.instagramPageName ?? "",
    instagram_connection_status: settings.instagramConnectionStatus ?? "disconnected",
    instagram_connection_error_code: settings.instagramConnectionErrorCode ?? "",
    instagram_last_validated_at: settings.instagramLastValidatedAt?.trim() || null,
    instagram_token_expires_at: settings.instagramTokenExpiresAt?.trim() || null,
    instagram_candidate_accounts: settings.instagramCandidateAccounts ?? [],
    updated_at: new Date().toISOString(),
  };
}

export async function getDbSettings(userId: string): Promise<ConnectionSettings> {
  const client = getSupabaseServiceClient();
  if (!client) {
    console.error("[flowcart:db-settings] Supabase service client not configured");
    return DEFAULT_SETTINGS;
  }

  try {
    const { data, error } = await client.from(TABLE).select("*").eq("user_id", userId).single();

    if (error || !data) {
      return DEFAULT_SETTINGS;
    }

    return rowToSettings(data as DbSettingsRow);
  } catch (err) {
    console.error("[flowcart:db-settings] Read failed:", err);
    return DEFAULT_SETTINGS;
  }
}

export async function saveDbSettings(
  userId: string,
  settings: Partial<ConnectionSettings>
): Promise<ConnectionSettings> {
  const client = getSupabaseServiceClient();
  if (!client) {
    throw new Error("Supabase service client not configured.");
  }

  const existing = await getDbSettings(userId);
  const merged = mergeConnectionSettings(existing, settings);
  const row = buildDbRow(userId, merged);

  const { data, error } = await client
    .from(TABLE)
    .upsert(row as never, { onConflict: "user_id" })
    .select()
    .single();

  if (error) {
    console.error("[flowcart:db-settings] Save failed:", error.message);
    throw new Error(`Failed to save settings: ${error.message}`);
  }

  console.info(`[flowcart:db-settings] Saved settings for user=${userId.slice(0, 8)}...`);
  return rowToSettings(data as DbSettingsRow);
}

export function mergeConnectionSettings(
  existing: ConnectionSettings,
  incoming: Partial<ConnectionSettings>
): ConnectionSettings {
  function resolveSecret(nextValue: string | undefined, current: string): string {
    if (nextValue === undefined) return current;
    const trimmed = nextValue.trim();
    if (!trimmed || trimmed === SECRET_MASK) return current;
    return trimmed;
  }

  function resolveText(nextValue: string | undefined, current: string): string {
    if (nextValue === undefined) return current;
    return nextValue.trim();
  }

  const existingDomain = normalizeStoreDomain(existing.shopifyStoreDomain);
  const nextDomain = resolveText(incoming.shopifyStoreDomain, existingDomain);
  const normalizedNextDomain = nextDomain ? normalizeStoreDomain(nextDomain) : "";
  const domainChanged = normalizedNextDomain !== existingDomain;

  return {
    shopifyStoreDomain: normalizedNextDomain,
    shopifyAdminToken: domainChanged ? "" : existing.shopifyAdminToken,
    instagramAccessToken: resolveSecret(
      incoming.instagramAccessToken,
      existing.instagramAccessToken
    ),
    instagramBusinessAccountId: resolveText(
      incoming.instagramBusinessAccountId,
      existing.instagramBusinessAccountId
    ),
    instagramUserAccessToken: resolveSecret(
      incoming.instagramUserAccessToken,
      existing.instagramUserAccessToken ?? ""
    ),
    instagramPageId: resolveText(incoming.instagramPageId, existing.instagramPageId ?? ""),
    instagramPageName: resolveText(incoming.instagramPageName, existing.instagramPageName ?? ""),
    instagramConnectionStatus:
      incoming.instagramConnectionStatus ?? existing.instagramConnectionStatus ?? "disconnected",
    instagramConnectionErrorCode: resolveText(
      incoming.instagramConnectionErrorCode,
      existing.instagramConnectionErrorCode ?? ""
    ),
    instagramLastValidatedAt: resolveText(
      incoming.instagramLastValidatedAt,
      existing.instagramLastValidatedAt ?? ""
    ),
    instagramTokenExpiresAt: resolveText(
      incoming.instagramTokenExpiresAt,
      existing.instagramTokenExpiresAt ?? ""
    ),
    instagramCandidateAccounts:
      incoming.instagramCandidateAccounts ?? existing.instagramCandidateAccounts ?? [],
  };
}

export async function saveShopifyAdminToken(
  userId: string,
  shopDomain: string,
  adminToken: string
): Promise<ConnectionSettings> {
  const client = getSupabaseServiceClient();
  if (!client) {
    throw new Error("Supabase service client not configured.");
  }

  const existing = await getDbSettings(userId);
  const row = buildDbRow(userId, {
    ...existing,
    shopifyStoreDomain: normalizeStoreDomain(shopDomain),
    shopifyAdminToken: adminToken.trim(),
  });

  const { data, error } = await client
    .from(TABLE)
    .upsert(row as never, { onConflict: "user_id" })
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to store Shopify authorization: ${error.message}`);
  }

  return rowToSettings(data as DbSettingsRow);
}

export async function clearShopifyAdminToken(userId: string): Promise<ConnectionSettings> {
  const client = getSupabaseServiceClient();
  if (!client) {
    throw new Error("Supabase service client not configured.");
  }

  const { data, error } = await client
    .from(TABLE)
    .update(
      {
        shopify_admin_token: "",
        updated_at: new Date().toISOString(),
      } as never
    )
    .eq("user_id", userId)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to clear Shopify authorization: ${error.message}`);
  }

  return rowToSettings(data as DbSettingsRow);
}

export async function saveInstagramConnectionState(
  userId: string,
  patch: InstagramConnectionStatePatch
): Promise<ConnectionSettings> {
  const client = getSupabaseServiceClient();
  if (!client) {
    throw new Error("Supabase service client not configured.");
  }

  const existing = await getDbSettings(userId);
  const merged = {
    ...existing,
    ...patch,
  };
  const row = buildDbRow(userId, merged);

  const { data, error } = await client
    .from(TABLE)
    .upsert(row as never, { onConflict: "user_id" })
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to store Instagram connection: ${error.message}`);
  }

  return rowToSettings(data as DbSettingsRow);
}

export async function clearInstagramConnectionState(userId: string): Promise<ConnectionSettings> {
  return saveInstagramConnectionState(userId, {
    instagramAccessToken: "",
    instagramBusinessAccountId: "",
    instagramUserAccessToken: "",
    instagramPageId: "",
    instagramPageName: "",
    instagramConnectionStatus: "disconnected",
    instagramConnectionErrorCode: "",
    instagramLastValidatedAt: "",
    instagramTokenExpiresAt: "",
    instagramCandidateAccounts: [],
  });
}
