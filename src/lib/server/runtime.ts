import { ConnectionSettings } from "@/src/lib/types";
import { safeNormalizeShopifyDomain } from "@/src/lib/shopify";
import { getStoredInstagramConnectionSummary } from "@/src/lib/server/instagram-connection-summary";

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
  return safeNormalizeShopifyDomain(storeDomain);
}

export function getExecutionReadiness(settings: ConnectionSettings) {
  const shopifyStoreDomainReady = normalizeStoreDomain(settings.shopifyStoreDomain).length > 0;
  const shopifyAdminTokenReady = settings.shopifyAdminToken.trim().length > 0;
  const shopifyReady = shopifyStoreDomainReady && shopifyAdminTokenReady;
  const shopifyReauthorizationRequired = shopifyStoreDomainReady && !shopifyAdminTokenReady;

  const instagramEnabled = isInstagramEnabled();
  const instagramConnection = getStoredInstagramConnectionSummary(settings);
  const instagramConfigured = !instagramEnabled || instagramConnection.canPublish;

  const missingRequirements: string[] = [];
  if (!shopifyStoreDomainReady) missingRequirements.push("shopifyStoreDomain");
  if (!shopifyAdminTokenReady) missingRequirements.push("shopifyAdminToken");
  if (instagramEnabled && !instagramConnection.hasPublishCredential) {
    missingRequirements.push("instagramAccessToken");
  }
  if (
    instagramEnabled &&
    instagramConnection.selectedInstagramBusinessAccountId.trim().length === 0
  ) {
    missingRequirements.push("instagramBusinessAccountId");
  }

  return {
    instagramEnabled,
    shopifyReady,
    shopifyReauthorizationRequired,
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
