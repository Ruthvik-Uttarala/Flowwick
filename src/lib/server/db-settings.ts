import { getSupabaseServiceClient } from "@/src/lib/supabase/server-client";
import { ConnectionSettings } from "@/src/lib/types";

const TABLE = "integration_settings";

const DEFAULT_SETTINGS: ConnectionSettings = {
  shopifyStoreDomain: "",
  shopifyAdminToken: "",
  shopifyAccessToken: "",
  shopifyClientId: "",
  shopifyClientSecret: "",
  instagramAccessToken: "",
  instagramBusinessAccountId: "",
};

interface DbSettingsRow {
  id: string;
  user_id: string;
  shopify_store_domain: string;
  shopify_client_id: string;
  shopify_client_secret: string;
  instagram_access_token: string;
  instagram_business_account_id: string;
  created_at: string;
  updated_at: string;
}

function rowToSettings(row: DbSettingsRow): ConnectionSettings {
  return {
    shopifyStoreDomain: row.shopify_store_domain ?? "",
    shopifyAdminToken: "",
    shopifyAccessToken: "",
    shopifyClientId: row.shopify_client_id ?? "",
    shopifyClientSecret: row.shopify_client_secret ?? "",
    instagramAccessToken: row.instagram_access_token ?? "",
    instagramBusinessAccountId: row.instagram_business_account_id ?? "",
  };
}

export async function getDbSettings(
  userId: string
): Promise<ConnectionSettings> {
  const client = getSupabaseServiceClient();
  if (!client) {
    console.error(
      "[merchflow:db-settings] Supabase service client not configured"
    );
    return DEFAULT_SETTINGS;
  }

  try {
    const { data, error } = await client
      .from(TABLE)
      .select("*")
      .eq("user_id", userId)
      .single();

    if (error || !data) {
      console.info(
        `[merchflow:db-settings] No settings found for user=${userId.slice(0, 8)}...`
      );
      return DEFAULT_SETTINGS;
    }

    return rowToSettings(data as DbSettingsRow);
  } catch (err) {
    console.error("[merchflow:db-settings] Read failed:", err);
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

  const row = {
    user_id: userId,
    shopify_store_domain:
      settings.shopifyStoreDomain?.trim() || existing.shopifyStoreDomain,
    shopify_client_id:
      (settings.shopifyClientId ?? "").trim() || existing.shopifyClientId || "",
    shopify_client_secret:
      (settings.shopifyClientSecret ?? "").trim() ||
      existing.shopifyClientSecret ||
      "",
    instagram_access_token:
      settings.instagramAccessToken?.trim() || existing.instagramAccessToken,
    instagram_business_account_id:
      settings.instagramBusinessAccountId?.trim() ||
      existing.instagramBusinessAccountId,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await client
    .from(TABLE)
    .upsert(row, { onConflict: "user_id" })
    .select()
    .single();

  if (error) {
    console.error("[merchflow:db-settings] Save failed:", error.message);
    throw new Error(`Failed to save settings: ${error.message}`);
  }

  console.info(
    `[merchflow:db-settings] Saved settings for user=${userId.slice(0, 8)}...`
  );
  return rowToSettings(data as DbSettingsRow);
}
