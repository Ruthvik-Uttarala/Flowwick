import { ConnectionSettings } from "@/src/lib/types";

function parseBooleanEnv(value: string | undefined, defaultValue = false): boolean {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return defaultValue;
  return ["1", "true", "yes", "on"].includes(normalized);
}

export function isInstagramEnabled(): boolean {
  return parseBooleanEnv(process.env.INSTAGRAM_ENABLED, true);
}

export function hasPublicUrl(url: string): boolean {
  return /^https?:\/\//i.test(url.trim());
}

export function normalizeStoreDomain(storeDomain: string): string {
  const normalized = storeDomain
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\/+$/, "");
  if (!normalized) return "";
  if (normalized.includes(".")) return normalized;
  return `${normalized}.myshopify.com`;
}

export function getExecutionReadiness(settings: ConnectionSettings) {
  const shopifyStoreDomainReady = normalizeStoreDomain(settings.shopifyStoreDomain).length > 0;
  const shopifyAdminTokenReady = settings.shopifyAdminToken.trim().length > 0;
  const shopifyReady = shopifyStoreDomainReady && shopifyAdminTokenReady;

  const instagramEnabled = isInstagramEnabled();
  const instagramConfigured =
    !instagramEnabled ||
    (settings.instagramAccessToken.trim().length > 0 &&
      settings.instagramBusinessAccountId.trim().length > 0);

  const missingRequirements: string[] = [];
  if (!shopifyStoreDomainReady) missingRequirements.push("shopifyStoreDomain");
  if (!shopifyAdminTokenReady) missingRequirements.push("shopifyAdminToken");
  if (instagramEnabled && settings.instagramAccessToken.trim().length === 0) {
    missingRequirements.push("instagramAccessToken");
  }
  if (instagramEnabled && settings.instagramBusinessAccountId.trim().length === 0) {
    missingRequirements.push("instagramBusinessAccountId");
  }

  return {
    instagramEnabled,
    shopifyReady,
    shopifyDirectExecutionReady: shopifyReady,
    instagramConfigured,
    readyToLaunch: shopifyReady && instagramConfigured,
    missingRequirements,
  };
}

export function describeExecutionReadiness(settings: ConnectionSettings) {
  const readiness = getExecutionReadiness(settings);
  return {
    ...readiness,
    modeLabel: readiness.readyToLaunch ? "Ready to Launch" : "Configuration Incomplete",
  };
}
