import { getDbSettings } from "@/src/lib/server/db-settings";

export interface ActiveCredentials {
  shopifyStoreDomain: string;
  shopifyAdminToken: string;
  instagramAccessToken: string;
  instagramBusinessAccountId: string;
}

export async function getActiveCredentials(userId: string): Promise<ActiveCredentials> {
  const settings = await getDbSettings(userId);
  return {
    shopifyStoreDomain: settings.shopifyStoreDomain,
    shopifyAdminToken: settings.shopifyAdminToken,
    instagramAccessToken: settings.instagramAccessToken,
    instagramBusinessAccountId: settings.instagramBusinessAccountId,
  };
}
