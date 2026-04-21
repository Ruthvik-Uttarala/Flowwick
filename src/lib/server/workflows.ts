import {
  ActiveInstagramCredentials,
  BucketPatchPayload,
  ConnectionSettings,
  DoneBucketSyncResult,
  GoAllSummary,
  ProductBucket,
} from "@/src/lib/types";
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
import {
  createShopifyProductArtifact,
  updateShopifyProductArtifact,
} from "@/src/lib/server/adapters/shopify";
import {
  publishInstagramPostArtifact,
  updateInstagramPostArtifact,
} from "@/src/lib/server/adapters/instagram";
import { normalizeStoreDomain } from "@/src/lib/server/runtime";

interface WorkflowResult {
  bucket: ProductBucket | null;
  notFound: boolean;
  error?: string;
}

interface DoneBucketSyncWorkflowResult {
  result: DoneBucketSyncResult | null;
  notFound: boolean;
  error?: string;
}

function buildLaunchPayload(
  bucket: ProductBucket,
  settings: ConnectionSettings,
  title: string,
  description: string
) {
  return {
    storeDomain: normalizeStoreDomain(settings.shopifyStoreDomain),
    shopifyAdminToken: settings.shopifyAdminToken,
    instagramAccessToken: settings.instagramAccessToken,
    instagramBusinessAccountId: settings.instagramBusinessAccountId,
    title,
    description,
    price: bucket.price ?? 1,
    quantity: bucket.quantity ?? 1,
    imageUrls: bucket.imageUrls,
  };
}

/**
 * Enhancement: calls OpenAI, then writes the result into BOTH the enhanced field
 * AND the raw field so the input shows the improved text immediately.
 */
export async function enhanceBucket(
  bucketId: string,
  userId: string,
  mode: "enhanceTitle" | "enhanceDescription",
  settings: ConnectionSettings
): Promise<WorkflowResult> {
  void settings;
  const existingBucket =
    (await getBucketById(bucketId, userId)) ?? (await createBucket(userId));

  await updateBucket(existingBucket.id, userId, (bucket) => ({
    ...bucket,
    status: "ENHANCING",
    errorMessage: "",
  }));

  try {
    let titleRaw = existingBucket.titleRaw;
    let titleEnhanced = existingBucket.titleEnhanced;
    let descriptionRaw = existingBucket.descriptionRaw;
    let descriptionEnhanced = existingBucket.descriptionEnhanced;

    if (mode === "enhanceTitle") {
      const enhanced = await enhanceTitleViaOpenAI(existingBucket.titleRaw);
      // Write enhanced text back into the raw field so the input is updated in UI
      titleRaw = enhanced;
      titleEnhanced = enhanced;
    } else {
      const enhanced = await enhanceDescriptionViaOpenAI(existingBucket.descriptionRaw);
      descriptionRaw = enhanced;
      descriptionEnhanced = enhanced;
    }

    const updated = await updateBucket(existingBucket.id, userId, (bucket) => {
      const next = {
        ...bucket,
        titleRaw,
        titleEnhanced,
        descriptionRaw,
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
  settings: ConnectionSettings,
  instagramCredentials: ActiveInstagramCredentials | null = null
): Promise<WorkflowResult> {
  const existingBucket =
    (await getBucketById(bucketId, userId)) ?? (await createBucket(userId));

  await updateBucket(existingBucket.id, userId, (bucket) => ({
    ...bucket,
    status: "PROCESSING",
    errorMessage: "",
  }));

  // Use enhanced value if present, otherwise raw; auto-enhance if neither exists
  let finalTitle = (existingBucket.titleEnhanced || existingBucket.titleRaw).trim();
  let finalDescription = (
    existingBucket.descriptionEnhanced || existingBucket.descriptionRaw
  ).trim();

  if (!finalTitle) {
    try {
      finalTitle = await enhanceTitleViaOpenAI(existingBucket.titleRaw);
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

  if (!finalDescription) {
    try {
      finalDescription = await enhanceDescriptionViaOpenAI(existingBucket.descriptionRaw);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Description enhancement failed during launch.";
      const failed = await updateBucket(existingBucket.id, userId, (bucket) => ({
        ...bucket,
        errorMessage: message,
        status: "FAILED",
      }));
      return { bucket: failed, notFound: false, error: message };
    }
  }

  const launchPayload = buildLaunchPayload(existingBucket, settings, finalTitle, finalDescription);

  // Step 1: Create Shopify product
  const shopifyArtifact = await createShopifyProductArtifact({
    payload: launchPayload,
    settings,
  });

  console.log(
    "[flowcart:workflow] Shopify result:",
    shopifyArtifact.shopifyCreated,
    shopifyArtifact.shopifyProductId || shopifyArtifact.errorMessage
  );

  // Step 2: Post to Instagram ONLY if Shopify succeeded
  const instagramArtifact = shopifyArtifact.shopifyCreated
    ? (() => {
        console.log("[flowcart:workflow] Triggering Instagram...");
        return publishInstagramPostArtifact({
          payload: launchPayload,
          instagramCredentials,
          shopifyProductUrl: shopifyArtifact.shopifyProductUrl,
          shopifyImageUrl: shopifyArtifact.shopifyImageUrl,
        });
      })()
    : Promise.resolve({
        instagramPublished: false,
        instagramPostId: "",
        instagramPostUrl: "",
        adapterMode: "live" as const,
        errorMessage:
          "Instagram was not attempted because Shopify product creation failed.",
      });

  const igResult = await instagramArtifact;

  const updated = await updateBucket(existingBucket.id, userId, (bucket) => {
    const errors = [shopifyArtifact.errorMessage, igResult.errorMessage].filter(
      (msg): msg is string => Boolean(msg && msg.trim().length > 0)
    );
    const errorMessage = errors.join(" | ");
    const isDone =
      shopifyArtifact.shopifyCreated && igResult.instagramPublished && errorMessage.length === 0;

    return {
      ...bucket,
      titleEnhanced: finalTitle,
      descriptionEnhanced: finalDescription,
      shopifyCreated: shopifyArtifact.shopifyCreated,
      shopifyProductId: shopifyArtifact.shopifyProductId,
      shopifyProductUrl: shopifyArtifact.shopifyProductUrl,
      instagramPublished: igResult.instagramPublished,
      instagramPostId: igResult.instagramPostId,
      instagramPostUrl: igResult.instagramPostUrl,
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
  settings: ConnectionSettings,
  instagramCredentials: ActiveInstagramCredentials | null = null
): Promise<GoAllSummary> {
  const buckets = await getBuckets(userId);
  const readyBucketIds = buckets
    .filter((b) => b.status === "READY" && hasRequiredBucketFields(b))
    .map((b) => b.id);

  let succeeded = 0;
  let failed = 0;

  console.info(`[flowcart:workflow] go-all started readyCount=${readyBucketIds.length}`);

  for (const bucketId of readyBucketIds) {
    console.info(`[flowcart:workflow] go-all processing bucketId=${bucketId}`);
    const result = await launchBucket(bucketId, userId, settings, instagramCredentials);
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

  return { total: readyBucketIds.length, succeeded, failed, bucketIds: readyBucketIds };
}

function applyDoneDraft(
  bucket: ProductBucket,
  patch: BucketPatchPayload
): ProductBucket {
  const nextTitleRaw = patch.titleRaw ?? bucket.titleRaw;
  const nextDescriptionRaw = patch.descriptionRaw ?? bucket.descriptionRaw;
  const nextTitleEnhanced = patch.titleRaw !== undefined ? patch.titleRaw : bucket.titleEnhanced;
  const nextDescriptionEnhanced =
    patch.descriptionRaw !== undefined ? patch.descriptionRaw : bucket.descriptionEnhanced;
  // Keep numeric fields strictly independent so a price edit can never alter quantity (and vice-versa).
  const nextQuantity = patch.quantity !== undefined ? patch.quantity : bucket.quantity;
  const nextPrice = patch.price !== undefined ? patch.price : bucket.price;

  return {
    ...bucket,
    titleRaw: nextTitleRaw,
    descriptionRaw: nextDescriptionRaw,
    titleEnhanced: nextTitleEnhanced,
    descriptionEnhanced: nextDescriptionEnhanced,
    quantity: nextQuantity,
    price: nextPrice,
    errorMessage: "",
    status: "DONE",
  };
}

export async function syncDoneBucket(
  bucketId: string,
  userId: string,
  patch: BucketPatchPayload,
  settings: ConnectionSettings,
  instagramCredentials: ActiveInstagramCredentials | null = null
): Promise<DoneBucketSyncWorkflowResult> {
  const current = await getBucketById(bucketId, userId);
  if (!current) {
    return { result: null, notFound: true, error: "Bucket not found." };
  }

  if (current.status !== "DONE" || !current.shopifyProductId.trim()) {
    return {
      result: null,
      notFound: false,
      error: "Only launched DONE buckets can be synced in-place.",
    };
  }

  const draft = applyDoneDraft(current, patch);
  const finalTitle = (draft.titleEnhanced || draft.titleRaw).trim();
  const finalDescription = (draft.descriptionEnhanced || draft.descriptionRaw).trim();
  const launchPayload = buildLaunchPayload(draft, settings, finalTitle, finalDescription);

  const shopifyArtifact = await updateShopifyProductArtifact({
    payload: launchPayload,
    settings,
    existingProductId: current.shopifyProductId,
  });

  if (!shopifyArtifact.shopifyCreated) {
    return {
      result: {
        bucket: current,
        shopifyUpdated: false,
        shopifyProductId: current.shopifyProductId,
        instagramOutcome: "skipped",
        message: shopifyArtifact.errorMessage || "Shopify update failed.",
      },
      notFound: false,
      error: shopifyArtifact.errorMessage || "Shopify update failed.",
    };
  }

  const instagramEdit = await updateInstagramPostArtifact({
    payload: launchPayload,
    instagramCredentials,
    instagramPostId: current.instagramPostId,
    instagramPostUrl: current.instagramPostUrl,
    shopifyProductUrl: shopifyArtifact.shopifyProductUrl,
  });

  const persisted = await updateBucket(bucketId, userId, (bucket) => ({
    ...applyDoneDraft(bucket, patch),
    shopifyCreated: true,
    shopifyProductId: current.shopifyProductId,
    shopifyProductUrl: shopifyArtifact.shopifyProductUrl || current.shopifyProductUrl,
    instagramPublished: bucket.instagramPublished,
    instagramPostId: current.instagramPostId,
    instagramPostUrl: current.instagramPostUrl,
    errorMessage: "",
    status: "DONE",
  }));

  if (!persisted) {
    return {
      result: null,
      notFound: false,
      error: "Bucket could not be persisted after sync.",
    };
  }

  const shopifyMessage = shopifyArtifact.warningMessage
    ? `Shopify updated existing product fields in place (title, description, and price). ${shopifyArtifact.warningMessage}`
    : "Shopify updated existing product fields in place (title, description, and price).";

  const instagramMessage =
    instagramEdit.outcome === "updated"
      ? "Instagram updated the existing post in place."
      : instagramEdit.outcome === "unsupported"
        ? `Instagram edit-in-place is unsupported for this published post path. ${instagramEdit.errorMessage}`
        : instagramEdit.outcome === "failed"
          ? `Instagram update failed unexpectedly: ${instagramEdit.errorMessage}`
          : "Instagram update was skipped.";

  const finalMessage = `${shopifyMessage} ${instagramMessage}`.trim();

  return {
    result: {
      bucket: persisted,
      shopifyUpdated: true,
      shopifyProductId: current.shopifyProductId,
      instagramOutcome: instagramEdit.outcome,
      message: finalMessage,
    },
    notFound: false,
  };
}
