import { z } from "zod";
import { ConnectionSettings } from "@/src/lib/types";
import { describeExecutionReadiness, getExecutionReadiness } from "@/src/lib/server/runtime";

export const settingsSchema = z.object({
  shopifyStoreDomain: z.string(),
  shopifyAdminToken: z.string().default(""),
  instagramAccessToken: z.string().default(""),
  instagramBusinessAccountId: z.string().default(""),
});

export function redactSettingsForClient(settings: ConnectionSettings): ConnectionSettings {
  return {
    ...settings,
    shopifyAdminToken: settings.shopifyAdminToken ? "••••••••" : "",
    instagramAccessToken: settings.instagramAccessToken ? "••••••••" : "",
  };
}

export function getSettingsStatus(settings: ConnectionSettings) {
  const readiness = describeExecutionReadiness(settings);
  return {
    shopifyStoreDomainPresent: settings.shopifyStoreDomain.trim().length > 0,
    shopifyAdminTokenPresent: settings.shopifyAdminToken.trim().length > 0,
    instagramAccessTokenPresent: settings.instagramAccessToken.trim().length > 0,
    instagramBusinessAccountIdPresent: settings.instagramBusinessAccountId.trim().length > 0,
    instagramEnabled: readiness.instagramEnabled,
    configured: areSettingsConfigured(settings),
    readyForLaunch: readiness.readyToLaunch,
  };
}

export function areSettingsConfigured(settings: ConnectionSettings): boolean {
  return getExecutionReadiness(settings).readyToLaunch;
}
