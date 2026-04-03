import { z } from "zod";
import { ConnectionSettings } from "@/src/lib/types";
import { describeExecutionReadiness, getExecutionReadiness } from "@/src/lib/server/runtime";
import { normalizeShopifyDomain } from "@/src/lib/shopify";

export const SECRET_MASK = "••••••••";

function normalizeOptionalShopifyDomain(value: string, ctx: z.RefinementCtx): string {
  const trimmed = value.trim();
  if (!trimmed) return "";

  try {
    return normalizeShopifyDomain(trimmed);
  } catch (error) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message:
        error instanceof Error
          ? error.message
          : "Enter a valid Shopify store domain such as your-store.myshopify.com.",
    });
    return z.NEVER;
  }
}

export const settingsSchema = z.object({
  shopifyStoreDomain: z
    .string()
    .default("")
    .transform((value, ctx) => normalizeOptionalShopifyDomain(value, ctx)),
  instagramAccessToken: z.string().default(""),
  instagramBusinessAccountId: z.string().default(""),
});

export function redactSettingsForClient(settings: ConnectionSettings): ConnectionSettings {
  return {
    ...settings,
    shopifyAdminToken: settings.shopifyAdminToken ? SECRET_MASK : "",
    instagramAccessToken: settings.instagramAccessToken ? SECRET_MASK : "",
  };
}

export function getSettingsStatus(settings: ConnectionSettings) {
  const readiness = describeExecutionReadiness(settings);
  const instagramAccessTokenPresent = settings.instagramAccessToken.trim().length > 0;
  const instagramBusinessAccountIdPresent =
    settings.instagramBusinessAccountId.trim().length > 0;
  const configured =
    settings.shopifyStoreDomain.trim().length > 0 &&
    (!readiness.instagramEnabled ||
      (instagramAccessTokenPresent && instagramBusinessAccountIdPresent));

  return {
    shopifyStoreDomainPresent: settings.shopifyStoreDomain.trim().length > 0,
    shopifyConnected: settings.shopifyAdminToken.trim().length > 0,
    shopifyReauthorizationRequired: readiness.shopifyReauthorizationRequired,
    instagramAccessTokenPresent,
    instagramBusinessAccountIdPresent,
    instagramEnabled: readiness.instagramEnabled,
    configured,
    readyForLaunch: readiness.readyToLaunch,
  };
}

export function areSettingsConfigured(settings: ConnectionSettings): boolean {
  const readiness = getExecutionReadiness(settings);
  const instagramAccessTokenPresent = settings.instagramAccessToken.trim().length > 0;
  const instagramBusinessAccountIdPresent =
    settings.instagramBusinessAccountId.trim().length > 0;

  return (
    settings.shopifyStoreDomain.trim().length > 0 &&
    (!readiness.instagramEnabled ||
      (instagramAccessTokenPresent && instagramBusinessAccountIdPresent))
  );
}
