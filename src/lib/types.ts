export const BUCKET_STATUSES = [
  "EMPTY",
  "READY",
  "ENHANCING",
  "PROCESSING",
  "DONE",
  "FAILED",
] as const;

export type BucketStatus = (typeof BUCKET_STATUSES)[number];

export type InstagramConnectionStatus =
  | "disconnected"
  | "connected"
  | "needs_reconnect"
  | "invalid_expired_token"
  | "missing_page_linkage"
  | "missing_instagram_business_account"
  | "selection_required"
  | "legacy_fallback";

export type InstagramConnectionSource =
  | "none"
  | "oauth_cached_page_token"
  | "oauth_derived_page_token"
  | "legacy_fallback";

export interface InstagramCandidateAccount {
  pageId: string;
  pageName: string;
  instagramBusinessAccountId: string;
}

export interface InstagramConnectionSummary {
  enabled: boolean;
  status: InstagramConnectionStatus;
  statusLabel: string;
  source: InstagramConnectionSource;
  selectedPageId: string;
  selectedPageName: string;
  selectedInstagramBusinessAccountId: string;
  hasLongLivedUserToken: boolean;
  hasPublishCredential: boolean;
  canPublish: boolean;
  needsReconnect: boolean;
  errorCode: string;
  lastValidatedAt: string;
  tokenExpiresAt: string;
  candidates: InstagramCandidateAccount[];
}

export interface ActiveInstagramCredentials {
  status: InstagramConnectionStatus;
  source: Exclude<InstagramConnectionSource, "none">;
  pageId: string;
  pageName: string;
  instagramBusinessAccountId: string;
  publishAccessToken: string;
  hasLongLivedUserToken: boolean;
}

export interface ConnectionSettings {
  shopifyStoreDomain: string;
  shopifyAdminToken: string;
  instagramAccessToken: string;
  instagramBusinessAccountId: string;
  instagramUserAccessToken?: string;
  instagramPageId?: string;
  instagramPageName?: string;
  instagramConnectionStatus?: InstagramConnectionStatus;
  instagramConnectionErrorCode?: string;
  instagramLastValidatedAt?: string;
  instagramTokenExpiresAt?: string;
  instagramCandidateAccounts?: InstagramCandidateAccount[];
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
  trashedAt: string;
  deleteAfterAt: string;
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

export type DoneBucketSyncPayload = BucketPatchPayload;

export type InstagramEditCapability =
  | "updated"
  | "unsupported"
  | "failed"
  | "skipped";

export interface DoneBucketSyncResult {
  bucket: ProductBucket;
  shopifyUpdated: boolean;
  shopifyProductId: string;
  instagramOutcome: InstagramEditCapability;
  message: string;
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
