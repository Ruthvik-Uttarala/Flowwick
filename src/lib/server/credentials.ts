import { getDbSettings } from "@/src/lib/server/db-settings";
import {
  getActiveInstagramCredentials,
  getResolvedInstagramFields,
} from "@/src/lib/server/instagram-credentials";
import { ActiveInstagramCredentials } from "@/src/lib/types";

export interface ActiveCredentials {
  shopifyStoreDomain: string;
  shopifyAdminToken: string;
  instagramAccessToken: string;
  instagramBusinessAccountId: string;
  instagramCredentials: ActiveInstagramCredentials | null;
}

export async function getActiveCredentials(userId: string): Promise<ActiveCredentials> {
  const settings = await getDbSettings(userId);
  const instagramCredentials = await getActiveInstagramCredentials(userId);
  const resolvedInstagram = getResolvedInstagramFields(instagramCredentials);

  return {
    shopifyStoreDomain: settings.shopifyStoreDomain,
    shopifyAdminToken: settings.shopifyAdminToken,
    instagramAccessToken: resolvedInstagram.instagramAccessToken,
    instagramBusinessAccountId: resolvedInstagram.instagramBusinessAccountId,
    instagramCredentials,
  };
}
