import { getSupabaseAdmin } from "@/src/lib/server/supabase-admin";
import { SHOPIFY_OAUTH_ERROR_MESSAGES } from "@/src/lib/shopify";

const TABLE = "shopify_oauth_states" as const;

export interface ShopifyOauthStateRow {
  state: string;
  user_id: string;
  shop_domain: string;
  created_at: string;
  expires_at: string;
}

export class ShopifyOauthStatePersistenceError extends Error {
  constructor() {
    super(SHOPIFY_OAUTH_ERROR_MESSAGES.oauth_state_persist_failed);
    this.name = "ShopifyOauthStatePersistenceError";
  }
}

export async function saveShopifyOauthState(input: {
  state: string;
  userId: string;
  shopDomain: string;
  createdAt: string;
  expiresAt: string;
}): Promise<void> {
  const client = getSupabaseAdmin();

  const { error: expiredCleanupError } = await client
    .from(TABLE)
    .delete()
    .lt("expires_at", input.createdAt);

  if (expiredCleanupError) {
    console.error(
      "[flowcart:shopify:oauth-state] Failed to clean up expired states:",
      expiredCleanupError.message
    );
  }

  const { error: userCleanupError } = await client
    .from(TABLE)
    .delete()
    .eq("user_id", input.userId);

  if (userCleanupError) {
    console.error(
      "[flowcart:shopify:oauth-state] Failed to remove prior user state:",
      userCleanupError.message
    );
    throw new ShopifyOauthStatePersistenceError();
  }

  const { error } = await client.from(TABLE).insert(
    {
      state: input.state,
      user_id: input.userId,
      shop_domain: input.shopDomain,
      created_at: input.createdAt,
      expires_at: input.expiresAt,
    }
  );

  if (error) {
    console.error(
      "[flowcart:shopify:oauth-state] Failed to persist OAuth state:",
      error.message
    );
    throw new ShopifyOauthStatePersistenceError();
  }
}

export async function getShopifyOauthState(
  state: string
): Promise<ShopifyOauthStateRow | null> {
  const { data, error } = await getSupabaseAdmin()
    .from(TABLE)
    .select("*")
    .eq("state", state)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return data as ShopifyOauthStateRow;
}

export async function deleteShopifyOauthState(state: string): Promise<void> {
  const { error } = await getSupabaseAdmin().from(TABLE).delete().eq("state", state);
  if (error) {
    throw new Error(`Failed to delete Shopify OAuth state: ${error.message}`);
  }
}
