import { ConnectionSettings, GoAllSummary, ProductBucket } from "@/src/lib/types";
import {
  createBucket,
  getBucketById,
  getBuckets,
  updateBucket,
} from "@/src/lib/server/buckets";
import {
  enhanceTitleViaOpenAI,
  enhanceDescriptionViaOpenAI,
} from "@/src/lib/server/openai";
import {
  getStableBucketStatus,
  hasRequiredBucketFields,
} from "@/src/lib/server/status";
import { createShopifyProductArtifact } from "@/src/lib/server/adapters/shopify";
import { publishInstagramPostArtifact } from "@/src/lib/server/adapters/instagram";
import { normalizeStoreDomain } from "@/src/lib/server/runtime";

interface WorkflowResult {
  bucket: ProductBucket | null;
  notFound: boolean;
  error?: string;
}

function buildLaunchPayload(
  bucket: ProductBucket,
  settings: ConnectionSettings
) {
  return {
    storeDomain: settings.shopifyStoreDomain,
    shopifyAdminToken: settings.shopifyAdminToken,
    instagramAccessToken: settings.instagramAccessToken,
    instagramBusinessAccountId: settings.instagramBusinessAccountId,
    titleRaw: bucket.titleRaw,
    descriptionRaw: bucket.descriptionRaw,
    price: bucket.price ?? 1,
    quantity: bucket.quantity ?? 1,
    imageUrls: bucket.imageUrls,
  };
}

export async function enhanceBucket(
  bucketId: string,
  userId: string,
  mode: "enhanceTitle" | "enhanceDescription",
  _settings: ConnectionSettings
): Promise<WorkflowResult> {
  const existingBucket =
    (await getBucketById(bucketId, userId)) ?? (await createBucket(userId));

  await updateBucket(existingBucket.id, userId, (bucket) => ({
    ...bucket,
    status: "ENHANCING",
    errorMessage: "",
  }));

  try {
    let titleEnhanced = existingBucket.titleEnhanced;
    let descriptionEnhanced = existingBucket.descriptionEnhanced;

    if (mode === "enhanceTitle") {
      titleEnhanced = await enhanceTitleViaOpenAI(existingBucket.titleRaw);
    } else {
      descriptionEnhanced = await enhanceDescriptionViaOpenAI(existingBucket.descriptionRaw);
    }

    const updated = await updateBucket(existingBucket.id, userId, (bucket) => {
      const next = {
        ...bucket,
        titleEnhanced,
        descriptionEnhanced,
        errorMessage: "",
      };
      return { ...next, status: getStableBucketStatus(next) };
    });

    if (!updated) {
      const fallback = await getBucketById(existingBucket.id, userId);
      return { bucket: fallback, notFound: false, error: "" };
    }

    return { bucket: updated, notFound: false };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : mode === "enhanceTitle"
          ? "Title enhancement failed."
          : "Description enhancement failed.";

    const failed = await updateBucket(existingBucket.id, userId, (bucket) => ({
      ...bucket,
      status: "FAILED",
      errorMessage: message,
    }));
    return { bucket: failed, notFound: false, error: message };
  }
}

export async function launchBucket(
  bucketId: string,
  userId: string,
  settings: ConnectionSettings
): Promise<WorkflowResult> {
  const existingBucket =
    (await getBucketById(bucketId, userId)) ?? (await createBucket(userId));

  await updateBucket(existingBucket.id, userId, (bucket) => ({
    ...bucket,
    status: "PROCESSING",
    errorMessage: "",
  }));

  let enhancedTitle = existingBucket.titleEnhanced.trim();
  let enhancedDescription = existingBucket.descriptionEnhanced.trim();

  // Auto-enhance title if not already enhanced
  if (!enhancedTitle) {
    try {
      enhancedTitle = await enhanceTitleViaOpenAI(existingBucket.titleRaw);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Title enhancement failed during launch.";
      const failed = await updateBucket(existingBucket.id, userId, (bucket) => ({
        ...bucket,
        errorMessage: message,
        status: "FAILED",
      }));
      return { bucket: failed, notFound: false, error: message };
    }
  }

  // Auto-enhance description if not already enhanced
  if (!enhancedDescription) {
    try {
      enhancedDescription = await enhanceDescriptionViaOpenAI(existingBucket.descriptionRaw);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Description enhancement failed during launch.";
      const failed = await updateBucket(existingBucket.id, userId, (bucket) => ({
        ...bucket,
        titleEnhanced: enhancedTitle,
        errorMessage: message,
        status: "FAILED",
      }));
      return { bucket: failed, notFound: false, error: message };
    }
  }

  const enhancementResult = {
    success: true,
    enhancedTitle,
    enhancedDescription,
    shopifyCreated: false,
    shopifyProductId: "",
    shopifyProductUrl: "",
    instagramPublished: false,
    instagramPostId: "",
    instagramPostUrl: "",
    errorMessage: "",
  };

  const launchPayload = {
    ...buildLaunchPayload(existingBucket, settings),
    storeDomain: normalizeStoreDomain(settings.shopifyStoreDomain),
    titleRaw: enhancedTitle || existingBucket.titleRaw.trim(),
    descriptionRaw: enhancedDescription || existingBucket.descriptionRaw.trim(),
  };

  const shopifyArtifact = await createShopifyProductArtifact({
    payload: launchPayload,
    enhancementResult,
    settings,
  });

  const instagramArtifact = shopifyArtifact.shopifyCreated
    ? await publishInstagramPostArtifact({
        payload: launchPayload,
        enhancementResult,
        settings,
        shopifyProductUrl: shopifyArtifact.shopifyProductUrl,
        shopifyImageUrl: shopifyArtifact.shopifyImageUrl,
      })
    : {
        instagramPublished: false,
        instagramPostId: "",
        instagramPostUrl: "",
        adapterMode: "live" as const,
        errorMessage:
          "Instagram was not attempted because Shopify product creation failed.",
      };

  const updated = await updateBucket(existingBucket.id, userId, (bucket) => {
    const errors = [shopifyArtifact.errorMessage, instagramArtifact.errorMessage].filter(
      (msg): msg is string => Boolean(msg && msg.trim().length > 0)
    );
    const errorMessage = errors.join(" | ");
    const isDone =
      shopifyArtifact.shopifyCreated &&
      instagramArtifact.instagramPublished &&
      errorMessage.length === 0;

    return {
      ...bucket,
      titleEnhanced: enhancedTitle || bucket.titleEnhanced,
      descriptionEnhanced: enhancedDescription || bucket.descriptionEnhanced,
      shopifyCreated: shopifyArtifact.shopifyCreated,
      shopifyProductId: shopifyArtifact.shopifyProductId,
      shopifyProductUrl: shopifyArtifact.shopifyProductUrl,
      instagramPublished: instagramArtifact.instagramPublished,
      instagramPostId: instagramArtifact.instagramPostId,
      instagramPostUrl: instagramArtifact.instagramPostUrl,
      errorMessage,
      status: isDone ? "DONE" : "FAILED",
    };
  });

  if (!updated) {
    const fallback = await getBucketById(existingBucket.id, userId);
    return { bucket: fallback, notFound: false, error: "" };
  }

  return { bucket: updated, notFound: false };
}

export async function goAllSequentially(
  userId: string,
  settings: ConnectionSettings
): Promise<GoAllSummary> {
  const buckets = await getBuckets(userId);
  const readyBucketIds = buckets
    .filter(
      (bucket) => bucket.status === "READY" && hasRequiredBucketFields(bucket)
    )
    .map((bucket) => bucket.id);

  let succeeded = 0;
  let failed = 0;

  console.info(`[flowcart:workflow] go-all started readyCount=${readyBucketIds.length}`);

  for (const bucketId of readyBucketIds) {
    console.info(`[flowcart:workflow] go-all processing bucketId=${bucketId}`);
    const result = await launchBucket(bucketId, userId, settings);
    if (result.bucket?.status === "DONE") {
      succeeded += 1;
    } else {
      failed += 1;
    }
    console.info(
      `[flowcart:workflow] go-all completed bucketId=${bucketId} status=${result.bucket?.status ?? "UNKNOWN"}`
    );
  }

  console.info(
    `[flowcart:workflow] go-all finished total=${readyBucketIds.length} succeeded=${succeeded} failed=${failed}`
  );

  return {
    total: readyBucketIds.length,
    succeeded,
    failed,
    bucketIds: readyBucketIds,
  };
}
