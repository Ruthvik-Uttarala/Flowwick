import { z } from "zod";
import { ConnectionSettings } from "@/src/lib/types";
import {
  describeExecutionReadiness,
  getExecutionReadiness,
  getShopifyAuthMode,
} from "@/src/lib/server/runtime";

export const settingsSchema = z.object({
  shopifyStoreDomain: z.string(),
  shopifyAdminToken: z.string().optional().default(""),
  shopifyAccessToken: z.string().optional().default(""),
  shopifyClientId: z.string().optional().default(""),
  shopifyClientSecret: z.string().optional().default(""),
  instagramAccessToken: z.string(),
  instagramBusinessAccountId: z.string(),
});

export function redactSettingsForClient(
  settings: ConnectionSettings
): ConnectionSettings {
  return {
    ...settings,
    shopifyAdminToken: "",
    shopifyAccessToken: "",
    shopifyClientSecret: settings.shopifyClientSecret ? "••••••••" : "",
    instagramAccessToken: settings.instagramAccessToken ? "••••••••" : "",
  };
}

export function getSettingsStatus(settings: ConnectionSettings) {
  const readiness = describeExecutionReadiness(settings);
  return {
    shopifyStoreDomainPresent: settings.shopifyStoreDomain.trim().length > 0,
    shopifyAdminTokenPresent: settings.shopifyAdminToken.trim().length > 0,
    shopifyAccessTokenPresent:
      (settings.shopifyAccessToken ?? "").trim().length > 0,
    shopifyClientIdPresent: (settings.shopifyClientId ?? "").trim().length > 0,
    shopifyClientSecretPresent:
      (settings.shopifyClientSecret ?? "").trim().length > 0,
    shopifyClientCredentialsPresent:
      (settings.shopifyClientId ?? "").trim().length > 0 &&
      (settings.shopifyClientSecret ?? "").trim().length > 0,
    shopifyAuthMode: getShopifyAuthMode(settings),
    instagramAccessTokenPresent: settings.instagramAccessToken.trim().length > 0,
    instagramBusinessAccountIdPresent:
      settings.instagramBusinessAccountId.trim().length > 0,
    instagramEnabled: readiness.instagramEnabled,
    configured: areSettingsConfigured(settings),
    readyForLaunch: readiness.readyToLaunch,
  };
}

export function areSettingsConfigured(settings: ConnectionSettings): boolean {
  return getExecutionReadiness(settings).readyToLaunch;
}
