import { getSupabaseServiceClient } from "@/src/lib/supabase/server-client";
import { ConnectionSettings } from "@/src/lib/types";
import { normalizeStoreDomain } from "@/src/lib/server/runtime";
import { SECRET_MASK } from "@/src/lib/server/settings";

const TABLE = "integration_settings" as const;

const DEFAULT_SETTINGS: ConnectionSettings = {
  shopifyStoreDomain: "",
  shopifyAdminToken: "",
  instagramAccessToken: "",
  instagramBusinessAccountId: "",
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
  created_at: string;
  updated_at: string;
}

function rowToSettings(row: DbSettingsRow): ConnectionSettings {
  return {
    shopifyStoreDomain: row.shopify_store_domain ?? "",
    shopifyAdminToken: row.shopify_admin_token ?? "",
    instagramAccessToken: row.instagram_access_token ?? "",
    instagramBusinessAccountId: row.instagram_business_account_id ?? "",
  };
}

export async function getDbSettings(userId: string): Promise<ConnectionSettings> {
  const client = getSupabaseServiceClient();
  if (!client) {
    console.error("[flowcart:db-settings] Supabase service client not configured");
    return DEFAULT_SETTINGS;
  }

  try {
    const { data, error } = await client
      .from(TABLE)
      .select("*")
      .eq("user_id", userId)
      .single();

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
  const row = {
    user_id: userId,
    shopify_store_domain: merged.shopifyStoreDomain,
    shopify_admin_token: merged.shopifyAdminToken,
    instagram_access_token: merged.instagramAccessToken,
    instagram_business_account_id: merged.instagramBusinessAccountId,
    updated_at: new Date().toISOString(),
  };

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

  const row = {
    user_id: userId,
    shopify_store_domain: normalizeStoreDomain(shopDomain),
    shopify_admin_token: adminToken.trim(),
    updated_at: new Date().toISOString(),
  };

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
