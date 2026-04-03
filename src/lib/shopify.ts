export const SHOPIFY_OAUTH_SCOPES = [
  "write_products",
  "read_locations",
  "read_inventory",
  "read_publications",
  "write_publications",
] as const;

export const SHOPIFY_OAUTH_SCOPE_PARAM = SHOPIFY_OAUTH_SCOPES.join(",");

export const SHOPIFY_CALLBACK_ERROR_MESSAGES = {
  missing_params: "Shopify OAuth failed because the callback was incomplete.",
  invalid_state: "Shopify OAuth failed because the request state was invalid.",
  expired_state: "Shopify OAuth failed because the authorization session expired.",
  invalid_hmac: "Shopify OAuth failed because the callback signature was invalid.",
  token_exchange_failed: "Shopify OAuth failed while exchanging the authorization code.",
  token_verification_failed: "Shopify OAuth failed because the access token could not be verified.",
  store_domain_mismatch: "Shopify OAuth failed because the callback shop did not match the saved store.",
} as const;

export type ShopifyCallbackErrorCode = keyof typeof SHOPIFY_CALLBACK_ERROR_MESSAGES;

const SHOPIFY_HOSTNAME_REGEX = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/;

export function normalizeShopifyDomain(value: string): string {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return "";

  const withoutProtocol = trimmed.replace(/^https?:\/\//i, "");
  const hostnameOnly = withoutProtocol.split("/")[0]?.replace(/\.+$/, "") ?? "";
  if (!hostnameOnly) return "";

  const normalized = hostnameOnly.includes(".")
    ? hostnameOnly
    : `${hostnameOnly}.myshopify.com`;

  if (!SHOPIFY_HOSTNAME_REGEX.test(normalized)) {
    throw new Error("Enter a valid Shopify store domain such as your-store.myshopify.com.");
  }

  return normalized;
}

export function safeNormalizeShopifyDomain(value: string): string {
  try {
    return normalizeShopifyDomain(value);
  } catch {
    return "";
  }
}

export function isShopifyDomainConfigured(value: string): boolean {
  return safeNormalizeShopifyDomain(value).length > 0;
}
