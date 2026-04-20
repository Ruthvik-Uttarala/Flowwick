import { randomUUID } from "node:crypto";
import { z } from "zod";
import { BUCKET_STATUSES, BucketPatchPayload, ProductBucket } from "@/src/lib/types";
import { getStableBucketStatus } from "@/src/lib/server/status";
import { getSupabaseAdmin } from "@/src/lib/server/supabase-admin";

export const bucketStatusSchema = z.enum(BUCKET_STATUSES);
export const TRASH_RETENTION_DAYS = 30;
const LEGACY_TRASH_PREFIX = "[flowcart-trash:";

export const bucketSchema = z.object({
  id: z.string().min(1),
  titleRaw: z.string(),
  descriptionRaw: z.string(),
  titleEnhanced: z.string(),
  descriptionEnhanced: z.string(),
  quantity: z.number().int().nonnegative().nullable(),
  price: z.number().nonnegative().nullable(),
  imageUrls: z.array(z.string()),
  status: bucketStatusSchema,
  shopifyCreated: z.boolean(),
  shopifyProductId: z.string(),
  shopifyProductUrl: z.string(),
  instagramPublished: z.boolean(),
  instagramPostId: z.string(),
  instagramPostUrl: z.string(),
  errorMessage: z.string(),
  trashedAt: z.string(),
  deleteAfterAt: z.string(),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
});

export const bucketPatchSchema = z
  .object({
    titleRaw: z.string().optional(),
    descriptionRaw: z.string().optional(),
    quantity: z.number().int().nonnegative().nullable().optional(),
    price: z.number().nonnegative().nullable().optional(),
  })
  .strict()
  .refine((payload) => Object.keys(payload).length > 0, {
    message: "At least one field is required to update the bucket.",
  });

export interface DbBucketRow {
  id: string;
  user_id: string;
  title_raw: string;
  description_raw: string;
  title_enhanced: string;
  description_enhanced: string;
  quantity: number | null;
  price: number | null;
  image_urls: string[];
  status: string;
  shopify_created: boolean;
  shopify_product_id: string;
  shopify_product_url: string;
  instagram_published: boolean;
  instagram_post_id: string;
  instagram_post_url: string;
  error_message: string;
  trashed_at?: string | null;
  delete_after_at?: string | null;
  created_at: string;
  updated_at: string;
}

function normalizeTimestamp(value: string | null | undefined): string {
  return value?.trim() ?? "";
}

function isMissingTrashColumnError(message: string | undefined): boolean {
  const normalized = (message ?? "").toLowerCase();
  return (
    normalized.includes("could not find the 'trashed_at' column") ||
    normalized.includes("could not find the 'delete_after_at' column") ||
    normalized.includes("column buckets.trashed_at does not exist") ||
    normalized.includes("column buckets.delete_after_at does not exist")
  );
}

function parseLegacyTrashEnvelope(rawErrorMessage: string): {
  trashedAt: string;
  deleteAfterAt: string;
  errorMessage: string;
  isLegacyTrashed: boolean;
} {
  const message = rawErrorMessage ?? "";
  if (!message.startsWith(LEGACY_TRASH_PREFIX)) {
    return {
      trashedAt: "",
      deleteAfterAt: "",
      errorMessage: message,
      isLegacyTrashed: false,
    };
  }

  const closeIndex = message.indexOf("]");
  if (closeIndex < 0) {
    return {
      trashedAt: "",
      deleteAfterAt: "",
      errorMessage: message,
      isLegacyTrashed: false,
    };
  }

  const header = message.slice(LEGACY_TRASH_PREFIX.length, closeIndex);
  const [trashedAtRaw, deleteAfterAtRaw] = header.split("|");
  const trashedAt = normalizeTimestamp(trashedAtRaw);
  const deleteAfterAt = normalizeTimestamp(deleteAfterAtRaw);
  if (!trashedAt || !deleteAfterAt) {
    return {
      trashedAt: "",
      deleteAfterAt: "",
      errorMessage: message,
      isLegacyTrashed: false,
    };
  }

  const suffix = message.slice(closeIndex + 1);
  const errorMessage = suffix.startsWith("\n") ? suffix.slice(1) : suffix;

  return {
    trashedAt,
    deleteAfterAt,
    errorMessage,
    isLegacyTrashed: true,
  };
}

function buildLegacyTrashEnvelope(
  errorMessage: string,
  trashedAt: string,
  deleteAfterAt: string
): string {
  const cleanError = errorMessage.trim();
  if (cleanError.length === 0) {
    return `${LEGACY_TRASH_PREFIX}${trashedAt}|${deleteAfterAt}]`;
  }
  return `${LEGACY_TRASH_PREFIX}${trashedAt}|${deleteAfterAt}]\n${cleanError}`;
}

function asNullableTimestamp(value: string): string | null {
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

export function mapDbBucketRowToBucket(row: DbBucketRow): ProductBucket {
  const legacyTrash = parseLegacyTrashEnvelope(row.error_message ?? "");
  const columnTrashedAt = normalizeTimestamp(row.trashed_at);
  const columnDeleteAfterAt = normalizeTimestamp(row.delete_after_at);
  const trashedAt = columnTrashedAt || legacyTrash.trashedAt;
  const deleteAfterAt = columnDeleteAfterAt || legacyTrash.deleteAfterAt;

  return {
    id: row.id,
    titleRaw: row.title_raw ?? "",
    descriptionRaw: row.description_raw ?? "",
    titleEnhanced: row.title_enhanced ?? "",
    descriptionEnhanced: row.description_enhanced ?? "",
    quantity: row.quantity,
    price: row.price != null ? Number(row.price) : null,
    imageUrls: row.image_urls ?? [],
    status: (BUCKET_STATUSES as readonly string[]).includes(row.status)
      ? (row.status as ProductBucket["status"])
      : "EMPTY",
    shopifyCreated: row.shopify_created ?? false,
    shopifyProductId: row.shopify_product_id ?? "",
    shopifyProductUrl: row.shopify_product_url ?? "",
    instagramPublished: row.instagram_published ?? false,
    instagramPostId: row.instagram_post_id ?? "",
    instagramPostUrl: row.instagram_post_url ?? "",
    errorMessage: legacyTrash.errorMessage,
    trashedAt,
    deleteAfterAt,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function bucketToRow(bucket: ProductBucket, userId: string) {
  return {
    id: bucket.id,
    user_id: userId,
    title_raw: bucket.titleRaw,
    description_raw: bucket.descriptionRaw,
    title_enhanced: bucket.titleEnhanced,
    description_enhanced: bucket.descriptionEnhanced,
    quantity: bucket.quantity,
    price: bucket.price,
    image_urls: bucket.imageUrls,
    status: bucket.status,
    shopify_created: bucket.shopifyCreated,
    shopify_product_id: bucket.shopifyProductId,
    shopify_product_url: bucket.shopifyProductUrl,
    instagram_published: bucket.instagramPublished,
    instagram_post_id: bucket.instagramPostId,
    instagram_post_url: bucket.instagramPostUrl,
    error_message: bucket.errorMessage,
    trashed_at: asNullableTimestamp(bucket.trashedAt),
    delete_after_at: asNullableTimestamp(bucket.deleteAfterAt),
    updated_at: new Date().toISOString(),
  };
}

function bucketToLegacyRow(bucket: ProductBucket, userId: string) {
  const row = bucketToRow(bucket, userId);
  const { trashed_at: _trashedAt, delete_after_at: _deleteAfterAt, ...legacyRow } = row;
  void _trashedAt;
  void _deleteAfterAt;
  return legacyRow;
}

function createEmptyBucketRecord(): ProductBucket {
  const now = new Date().toISOString();
  const bucket: ProductBucket = {
    id: randomUUID(),
    titleRaw: "",
    descriptionRaw: "",
    titleEnhanced: "",
    descriptionEnhanced: "",
    quantity: null,
    price: null,
    imageUrls: [],
    status: "EMPTY",
    shopifyCreated: false,
    shopifyProductId: "",
    shopifyProductUrl: "",
    instagramPublished: false,
    instagramPostId: "",
    instagramPostUrl: "",
    errorMessage: "",
    trashedAt: "",
    deleteAfterAt: "",
    createdAt: now,
    updatedAt: now,
  };

  return { ...bucket, status: getStableBucketStatus(bucket) };
}

export function buildTrashLifecycleWindow(referenceDate = new Date()): {
  trashedAt: string;
  deleteAfterAt: string;
} {
  const trashedAt = referenceDate.toISOString();
  const deleteAfterAt = new Date(
    referenceDate.getTime() + TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000
  ).toISOString();
  return { trashedAt, deleteAfterAt };
}

async function cleanupExpiredTrashedBuckets(userId: string): Promise<void> {
  const nowIso = new Date().toISOString();
  const { error } = await getSupabaseAdmin()
    .from("buckets")
    .delete()
    .eq("user_id", userId)
    .not("trashed_at", "is", null)
    .not("delete_after_at", "is", null)
    .lte("delete_after_at", nowIso);

  if (!error) {
    return;
  }

  if (isMissingTrashColumnError(error.message)) {
    const { data: legacyRows, error: legacyReadError } = await getSupabaseAdmin()
      .from("buckets")
      .select("id,error_message")
      .eq("user_id", userId);

    if (legacyReadError) {
      console.error(
        "[merchflow:buckets] Failed to cleanup legacy trashed buckets:",
        legacyReadError.message
      );
      return;
    }

    const expiredIds = (legacyRows as Array<{ id: string; error_message: string }>)
      .filter((row) => {
        const legacyTrash = parseLegacyTrashEnvelope(row.error_message ?? "");
        const deleteAfter = Date.parse(legacyTrash.deleteAfterAt);
        return legacyTrash.isLegacyTrashed && Number.isFinite(deleteAfter) && deleteAfter <= Date.now();
      })
      .map((row) => row.id);

    if (expiredIds.length === 0) {
      return;
    }

    const { error: legacyDeleteError } = await getSupabaseAdmin()
      .from("buckets")
      .delete()
      .eq("user_id", userId)
      .in("id", expiredIds);

    if (legacyDeleteError) {
      console.error(
        "[merchflow:buckets] Failed to delete expired legacy trashed buckets:",
        legacyDeleteError.message
      );
    }
    return;
  }

  if (error) {
    console.error("[merchflow:buckets] Failed to cleanup trashed buckets:", error.message);
  }
}

export async function getBuckets(userId: string): Promise<ProductBucket[]> {
  await cleanupExpiredTrashedBuckets(userId);

  const { data, error } = await getSupabaseAdmin()
    .from("buckets")
    .select("*")
    .eq("user_id", userId)
    .is("trashed_at", null)
    .order("created_at", { ascending: true });

  if (error && isMissingTrashColumnError(error.message)) {
    const { data: legacyData, error: legacyError } = await getSupabaseAdmin()
      .from("buckets")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: true });

    if (legacyError) {
      console.error("[merchflow:buckets] Failed to load legacy buckets:", legacyError.message);
      return [];
    }

    return (legacyData as DbBucketRow[])
      .map(mapDbBucketRowToBucket)
      .filter((bucket) => !bucket.trashedAt);
  }

  if (error) {
    console.error("[merchflow:buckets] Failed to load buckets:", error.message);
    return [];
  }

  return (data as DbBucketRow[]).map(mapDbBucketRowToBucket);
}

export async function getTrashedBuckets(userId: string): Promise<ProductBucket[]> {
  await cleanupExpiredTrashedBuckets(userId);

  const { data, error } = await getSupabaseAdmin()
    .from("buckets")
    .select("*")
    .eq("user_id", userId)
    .not("trashed_at", "is", null)
    .order("trashed_at", { ascending: false });

  if (error && isMissingTrashColumnError(error.message)) {
    const { data: legacyData, error: legacyError } = await getSupabaseAdmin()
      .from("buckets")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: true });

    if (legacyError) {
      console.error("[merchflow:buckets] Failed to load legacy trashed buckets:", legacyError.message);
      return [];
    }

    return (legacyData as DbBucketRow[])
      .map(mapDbBucketRowToBucket)
      .filter((bucket) => Boolean(bucket.trashedAt))
      .sort((left, right) => right.trashedAt.localeCompare(left.trashedAt));
  }

  if (error) {
    console.error("[merchflow:buckets] Failed to load trashed buckets:", error.message);
    return [];
  }

  return (data as DbBucketRow[]).map(mapDbBucketRowToBucket);
}

export async function createBucket(userId: string): Promise<ProductBucket> {
  await cleanupExpiredTrashedBuckets(userId);

  const created = createEmptyBucketRecord();
  const row = bucketToRow(created, userId);

  const { data, error } = await getSupabaseAdmin()
    .from("buckets")
    .insert({ ...row, created_at: created.createdAt })
    .select()
    .single();

  if (error && isMissingTrashColumnError(error.message)) {
    const legacyRow = bucketToLegacyRow(created, userId);
    const { data: legacyData, error: legacyError } = await getSupabaseAdmin()
      .from("buckets")
      .insert({ ...legacyRow, created_at: created.createdAt })
      .select()
      .single();

    if (legacyError) {
      console.error("[merchflow:buckets] Failed to create legacy bucket:", legacyError.message);
      throw new Error(`Failed to create bucket: ${legacyError.message}`);
    }

    return mapDbBucketRowToBucket(legacyData as DbBucketRow);
  }

  if (error) {
    console.error("[merchflow:buckets] Failed to create bucket:", error.message);
    throw new Error(`Failed to create bucket: ${error.message}`);
  }

  return mapDbBucketRowToBucket(data as DbBucketRow);
}

interface GetBucketOptions {
  includeTrashed?: boolean;
}

export async function getBucketById(
  bucketId: string,
  userId: string,
  options?: GetBucketOptions
): Promise<ProductBucket | null> {
  await cleanupExpiredTrashedBuckets(userId);

  let query = getSupabaseAdmin()
    .from("buckets")
    .select("*")
    .eq("id", bucketId)
    .eq("user_id", userId);

  if (!options?.includeTrashed) {
    query = query.is("trashed_at", null);
  }

  const { data, error } = await query.single();

  if (error && isMissingTrashColumnError(error.message)) {
    const { data: legacyData, error: legacyError } = await getSupabaseAdmin()
      .from("buckets")
      .select("*")
      .eq("id", bucketId)
      .eq("user_id", userId)
      .single();

    if (legacyError || !legacyData) {
      return null;
    }

    const bucket = mapDbBucketRowToBucket(legacyData as DbBucketRow);
    if (!options?.includeTrashed && bucket.trashedAt) {
      return null;
    }

    return bucket;
  }

  if (error || !data) {
    return null;
  }

  return mapDbBucketRowToBucket(data as DbBucketRow);
}

export async function updateBucket(
  bucketId: string,
  userId: string,
  updater: (bucket: ProductBucket) => ProductBucket
): Promise<ProductBucket | null> {
  const current = await getBucketById(bucketId, userId);
  if (!current) {
    return null;
  }

  const updated = updater(current);
  const row = bucketToRow(updated, userId);

  const { data, error } = await getSupabaseAdmin()
    .from("buckets")
    .update(row)
    .eq("id", bucketId)
    .eq("user_id", userId)
    .is("trashed_at", null)
    .select()
    .single();

  if (error && isMissingTrashColumnError(error.message)) {
    const legacyRow = bucketToLegacyRow(updated, userId);
    const { data: legacyData, error: legacyError } = await getSupabaseAdmin()
      .from("buckets")
      .update(legacyRow)
      .eq("id", bucketId)
      .eq("user_id", userId)
      .select()
      .single();

    if (legacyError) {
      console.error("[merchflow:buckets] Failed to update legacy bucket:", legacyError.message);
      throw new Error(`Failed to update bucket: ${legacyError.message}`);
    }

    const legacyBucket = mapDbBucketRowToBucket(legacyData as DbBucketRow);
    if (legacyBucket.trashedAt) {
      return null;
    }

    return legacyBucket;
  }

  if (error) {
    console.error("[merchflow:buckets] Failed to update bucket:", error.message);
    throw new Error(`Failed to update bucket: ${error.message}`);
  }

  return mapDbBucketRowToBucket(data as DbBucketRow);
}

export async function patchBucket(
  bucketId: string,
  userId: string,
  patch: BucketPatchPayload
): Promise<ProductBucket | null> {
  const parsedPatch = bucketPatchSchema.parse(patch);

  return updateBucket(bucketId, userId, (bucket) => {
    const changed = {
      ...bucket,
      ...parsedPatch,
      errorMessage: "",
      shopifyCreated: false,
      shopifyProductId: "",
      shopifyProductUrl: "",
      instagramPublished: false,
      instagramPostId: "",
      instagramPostUrl: "",
    };

    return {
      ...changed,
      status: getStableBucketStatus(changed),
    };
  });
}

export async function moveBucketToTrash(
  bucketId: string,
  userId: string
): Promise<ProductBucket | null> {
  await cleanupExpiredTrashedBuckets(userId);

  const current = await getBucketById(bucketId, userId);
  if (!current) {
    return null;
  }

  if (current.status !== "FAILED") {
    throw new Error("Only failed buckets can be moved to trash.");
  }

  const { trashedAt, deleteAfterAt } = buildTrashLifecycleWindow();

  const { data, error } = await getSupabaseAdmin()
    .from("buckets")
    .update({
      trashed_at: trashedAt,
      delete_after_at: deleteAfterAt,
      updated_at: new Date().toISOString(),
    })
    .eq("id", bucketId)
    .eq("user_id", userId)
    .is("trashed_at", null)
    .select()
    .single();

  if (error && isMissingTrashColumnError(error.message)) {
    const { data: legacyData, error: legacyError } = await getSupabaseAdmin()
      .from("buckets")
      .update({
        error_message: buildLegacyTrashEnvelope(current.errorMessage, trashedAt, deleteAfterAt),
        updated_at: new Date().toISOString(),
      })
      .eq("id", bucketId)
      .eq("user_id", userId)
      .select()
      .single();

    if (legacyError || !legacyData) {
      const legacyMessage = legacyError?.message ?? "Unknown legacy storage failure.";
      console.error("[merchflow:buckets] Failed to move bucket to legacy trash:", legacyMessage);
      throw new Error(`Failed to move bucket to trash: ${legacyMessage}`);
    }

    return mapDbBucketRowToBucket(legacyData as DbBucketRow);
  }

  if (error || !data) {
    if (error) {
      console.error("[merchflow:buckets] Failed to move bucket to trash:", error.message);
      throw new Error(`Failed to move bucket to trash: ${error.message}`);
    }
    return null;
  }

  return mapDbBucketRowToBucket(data as DbBucketRow);
}

export async function restoreBucketFromTrash(
  bucketId: string,
  userId: string
): Promise<ProductBucket | null> {
  await cleanupExpiredTrashedBuckets(userId);

  const current = await getBucketById(bucketId, userId, { includeTrashed: true });
  if (!current || !current.trashedAt) {
    return null;
  }

  const { data, error } = await getSupabaseAdmin()
    .from("buckets")
    .update({
      trashed_at: null,
      delete_after_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", bucketId)
    .eq("user_id", userId)
    .not("trashed_at", "is", null)
    .select()
    .single();

  if (error && isMissingTrashColumnError(error.message)) {
    const { data: legacyData, error: legacyError } = await getSupabaseAdmin()
      .from("buckets")
      .update({
        error_message: current.errorMessage,
        updated_at: new Date().toISOString(),
      })
      .eq("id", bucketId)
      .eq("user_id", userId)
      .select()
      .single();

    if (legacyError || !legacyData) {
      const legacyMessage = legacyError?.message ?? "Unknown legacy restore failure.";
      console.error("[merchflow:buckets] Failed to restore legacy bucket:", legacyMessage);
      throw new Error(`Failed to restore bucket: ${legacyMessage}`);
    }

    return mapDbBucketRowToBucket(legacyData as DbBucketRow);
  }

  if (error || !data) {
    if (error) {
      console.error("[merchflow:buckets] Failed to restore bucket:", error.message);
      throw new Error(`Failed to restore bucket: ${error.message}`);
    }
    return null;
  }

  return mapDbBucketRowToBucket(data as DbBucketRow);
}

export async function permanentlyDeleteBucket(
  bucketId: string,
  userId: string
): Promise<boolean> {
  await cleanupExpiredTrashedBuckets(userId);

  const { error, count } = await getSupabaseAdmin()
    .from("buckets")
    .delete({ count: "exact" })
    .eq("id", bucketId)
    .eq("user_id", userId);

  if (error) {
    console.error("[merchflow:buckets] Failed to permanently delete bucket:", error.message);
    throw new Error(`Failed to permanently delete bucket: ${error.message}`);
  }

  return (count ?? 0) > 0;
}

export async function saveBuckets(buckets: ProductBucket[]): Promise<void> {
  void buckets;
  // No-op: individual bucket operations now use Supabase directly
}
