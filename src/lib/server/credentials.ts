import { getSupabaseAdmin } from "@/src/lib/server/supabase-admin";

export interface ActiveCredentials {
  shopifyStoreDomain: string;
  shopifyClientId: string;
  shopifyClientSecret: string;
  instagramAccessToken: string;
  instagramBusinessAccountId: string;
}

export async function getActiveCredentials(userId: string): Promise<ActiveCredentials> {
  const { data } = await getSupabaseAdmin()
    .from("integration_settings")
    .select("*")
    .eq("user_id", userId)
    .single();

  if (data) {
    return {
      shopifyStoreDomain: data.shopify_store_domain || process.env.SHOPIFY_STORE_DOMAIN || "",
      shopifyClientId: data.shopify_client_id || process.env.SHOPIFY_CLIENT_ID || "",
      shopifyClientSecret: data.shopify_client_secret || process.env.SHOPIFY_CLIENT_SECRET || "",
      instagramAccessToken: data.instagram_access_token || process.env.INSTAGRAM_ACCESS_TOKEN || "",
      instagramBusinessAccountId: data.instagram_business_account_id || process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID || "",
    };
  }

  return {
    shopifyStoreDomain: process.env.SHOPIFY_STORE_DOMAIN || "",
    shopifyClientId: process.env.SHOPIFY_CLIENT_ID || "",
    shopifyClientSecret: process.env.SHOPIFY_CLIENT_SECRET || "",
    instagramAccessToken: process.env.INSTAGRAM_ACCESS_TOKEN || "",
    instagramBusinessAccountId: process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID || "",
  };
}
