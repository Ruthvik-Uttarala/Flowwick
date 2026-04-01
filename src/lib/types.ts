export const BUCKET_STATUSES = [
  "EMPTY",
  "READY",
  "ENHANCING",
  "PROCESSING",
  "DONE",
  "FAILED",
] as const;

export type BucketStatus = (typeof BUCKET_STATUSES)[number];

export interface ConnectionSettings {
  shopifyStoreDomain: string;
  shopifyAdminToken: string;
  shopifyAccessToken?: string;
  shopifyClientId?: string;
  shopifyClientSecret?: string;
  instagramAccessToken: string;
  instagramBusinessAccountId: string;
}

export interface ProductBucket {
  id: string;
  titleRaw: string;
  descriptionRaw: string;
  titleEnhanced: string;
  descriptionEnhanced: string;
  quantity: number | null;
  price: number | null;
  imageUrls: string[];
  status: BucketStatus;
  shopifyCreated: boolean;
  shopifyProductId: string;
  shopifyProductUrl: string;
  instagramPublished: boolean;
  instagramPostId: string;
  instagramPostUrl: string;
  errorMessage: string;
  createdAt: string;
  updatedAt: string;
}

export type EditableBucketField =
  | "titleRaw"
  | "descriptionRaw"
  | "quantity"
  | "price";

export interface BucketPatchPayload {
  titleRaw?: string;
  descriptionRaw?: string;
  quantity?: number | null;
  price?: number | null;
}

export type ShopifyAuthMode = "admin-token" | "client-credentials" | "missing";

export interface ApiErrorShape {
  message: string;
}

export interface ApiResponseShape<T = unknown> {
  ok: boolean;
  data?: T;
  error?: ApiErrorShape;
}

/**
 * Payload passed to launch adapters (Shopify, Instagram).
 * Enhancement (title/description) is handled separately via OpenAI before this.
 */
export interface LaunchPayload {
  storeDomain: string;
  shopifyAdminToken: string;
  instagramAccessToken: string;
  instagramBusinessAccountId: string;
  titleRaw: string;
  descriptionRaw: string;
  price: number;
  quantity: number;
  imageUrls: string[];
}

/**
 * Result object passed between the launch workflow and the Shopify/Instagram adapters.
 */
export interface EnhancementResult {
  success: boolean;
  enhancedTitle: string;
  enhancedDescription: string;
  shopifyCreated: boolean;
  shopifyProductId: string;
  shopifyProductUrl: string;
  instagramPublished: boolean;
  instagramPostId: string;
  instagramPostUrl: string;
  errorMessage: string;
}

export interface GoAllSummary {
  total: number;
  succeeded: number;
  failed: number;
  bucketIds: string[];
}

export interface SafeSettingsStatus {
  shopifyStoreDomainPresent: boolean;
  shopifyAdminTokenPresent: boolean;
  shopifyAccessTokenPresent: boolean;
  shopifyClientIdPresent: boolean;
  shopifyClientSecretPresent: boolean;
  shopifyClientCredentialsPresent: boolean;
  shopifyAuthMode: ShopifyAuthMode;
  instagramAccessTokenPresent: boolean;
  instagramBusinessAccountIdPresent: boolean;
  instagramEnabled: boolean;
  configured: boolean;
  readyForLaunch: boolean;
}

export interface LaunchReadinessStatus {
  appRunning: true;
  liveCapable: boolean;
  readyToLaunch: boolean;
  settingsConfigured: boolean;
  openaiConfigured: boolean;
  missingSettingsFields: string[];
  modeLabel: string;
}

export interface RuntimeConfigSnapshot {
  appRunning: true;
  openaiConfigured: boolean;
  settings: SafeSettingsStatus;
  launch: LaunchReadinessStatus;
  storage: {
    persistence: "file";
    dataDirectory: string;
    uploadsDirectory: string;
  };
}
