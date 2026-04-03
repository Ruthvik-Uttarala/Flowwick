import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  BUCKET_STATUSES,
  BucketPatchPayload,
  ProductBucket,
} from "@/src/lib/types";
import { getStableBucketStatus } from "@/src/lib/server/status";
import { getSupabaseAdmin } from "@/src/lib/server/supabase-admin";

export const bucketStatusSchema = z.enum(BUCKET_STATUSES);

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

interface DbBucketRow {
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
  created_at: string;
  updated_at: string;
}

function rowToBucket(row: DbBucketRow): ProductBucket {
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
    errorMessage: row.error_message ?? "",
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
    updated_at: new Date().toISOString(),
  };
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
    createdAt: now,
    updatedAt: now,
  };

  return { ...bucket, status: getStableBucketStatus(bucket) };
}

export async function getBuckets(userId: string): Promise<ProductBucket[]> {
  const { data, error } = await getSupabaseAdmin()
    .from("buckets")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[merchflow:buckets] Failed to load buckets:", error.message);
    return [];
  }

  return (data as DbBucketRow[]).map(rowToBucket);
}

export async function createBucket(userId: string): Promise<ProductBucket> {
  const created = createEmptyBucketRecord();
  const row = bucketToRow(created, userId);

  const { data, error } = await getSupabaseAdmin()
    .from("buckets")
    .insert({ ...row, created_at: created.createdAt })
    .select()
    .single();

  if (error) {
    console.error("[merchflow:buckets] Failed to create bucket:", error.message);
    throw new Error(`Failed to create bucket: ${error.message}`);
  }

  return rowToBucket(data as DbBucketRow);
}

export async function getBucketById(
  bucketId: string,
  userId: string
): Promise<ProductBucket | null> {
  const { data, error } = await getSupabaseAdmin()
    .from("buckets")
    .select("*")
    .eq("id", bucketId)
    .eq("user_id", userId)
    .single();

  if (error || !data) {
    return null;
  }

  return rowToBucket(data as DbBucketRow);
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
    .select()
    .single();

  if (error) {
    console.error("[merchflow:buckets] Failed to update bucket:", error.message);
    throw new Error(`Failed to update bucket: ${error.message}`);
  }

  return rowToBucket(data as DbBucketRow);
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

export async function saveBuckets(buckets: ProductBucket[]): Promise<void> {
  void buckets;
  // No-op: individual bucket operations now use Supabase directly
}
