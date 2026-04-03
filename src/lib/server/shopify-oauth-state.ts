import { getSupabaseAdmin } from "@/src/lib/server/supabase-admin";

const TABLE = "shopify_oauth_states" as const;

export interface ShopifyOauthStateRow {
  state: string;
  user_id: string;
  shop_domain: string;
  created_at: string;
  expires_at: string;
}

export async function saveShopifyOauthState(input: {
  state: string;
  userId: string;
  shopDomain: string;
  createdAt: string;
  expiresAt: string;
}): Promise<void> {
  const { error } = await getSupabaseAdmin().from(TABLE).upsert(
    {
      state: input.state,
      user_id: input.userId,
      shop_domain: input.shopDomain,
      created_at: input.createdAt,
      expires_at: input.expiresAt,
    },
    { onConflict: "state" }
  );

  if (error) {
    throw new Error(`Failed to persist Shopify OAuth state: ${error.message}`);
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
