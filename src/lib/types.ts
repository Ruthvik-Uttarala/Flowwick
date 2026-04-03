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
 * Title/description here are already the final values (enhanced or raw).
 */
export interface LaunchPayload {
  storeDomain: string;
  shopifyAdminToken: string;
  instagramAccessToken: string;
  instagramBusinessAccountId: string;
  title: string;
  description: string;
  price: number;
  quantity: number;
  imageUrls: string[];
}

export interface GoAllSummary {
  total: number;
  succeeded: number;
  failed: number;
  bucketIds: string[];
}

export interface SafeSettingsStatus {
  shopifyStoreDomainPresent: boolean;
  shopifyConnected: boolean;
  shopifyReauthorizationRequired: boolean;
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
