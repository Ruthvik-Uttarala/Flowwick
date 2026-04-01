import { LaunchPayload, EnhancementResult, ConnectionSettings } from "@/src/lib/types";
import { isInstagramEnabled } from "@/src/lib/server/runtime";

export interface InstagramLaunchArtifact {
  instagramPublished: boolean;
  instagramPostId: string;
  instagramPostUrl: string;
  adapterMode: "live";
  errorMessage: string;
}

interface InstagramCreateMediaResponse {
  id?: string;
  error?: unknown;
}

interface InstagramPublishResponse {
  id?: string;
  error?: unknown;
}

function buildFailure(message: string): InstagramLaunchArtifact {
  return {
    instagramPublished: false,
    instagramPostId: "",
    instagramPostUrl: "",
    adapterMode: "live",
    errorMessage: message,
  };
}

function hasPublicUrl(url: string): boolean {
  return /^https?:\/\//i.test(url.trim());
}

async function readJsonResponse<T>(response: Response): Promise<T | null> {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    const raw = await response.text().catch(() => "");
    return (raw ? ({ raw } as unknown as T) : null) as T | null;
  }

  return response.json().catch(() => null);
}

function normalizeGraphError(payload: unknown, status: number): string {
  if (!payload || typeof payload !== "object") {
    return `Instagram request failed with status ${status}.`;
  }

  const candidate = payload as { error?: unknown };
  if (!candidate.error) {
    return `Instagram request failed with status ${status}.`;
  }

  try {
    return JSON.stringify(candidate.error);
  } catch {
    return `Instagram request failed with status ${status}.`;
  }
}

function buildCaption(input: {
  payload: LaunchPayload;
  enhancementResult: EnhancementResult;
  shopifyProductUrl?: string;
}): string {
  const title = input.enhancementResult.enhancedTitle.trim() || input.payload.titleRaw.trim();
  const description =
    input.enhancementResult.enhancedDescription.trim() || input.payload.descriptionRaw.trim();
  const lines = [
    title,
    description,
    `Price: $${input.payload.price.toFixed(2)}`,
    `Quantity: ${input.payload.quantity}`,
  ];
  if (input.shopifyProductUrl && input.shopifyProductUrl.trim()) {
    lines.push(`Shop now: ${input.shopifyProductUrl.trim()}`);
  }

  return lines.filter((line) => line && line.trim().length > 0).join("\n\n");
}

function resolveImageUrl(input: {
  payload: LaunchPayload;
  shopifyImageUrl?: string;
}): string {
  if (input.shopifyImageUrl && hasPublicUrl(input.shopifyImageUrl)) {
    return input.shopifyImageUrl.trim();
  }

  const fromPayload = input.payload.imageUrls.find((url) => hasPublicUrl(url));
  return fromPayload?.trim() ?? "";
}

export async function publishInstagramPostArtifact(input: {
  payload: LaunchPayload;
  enhancementResult: EnhancementResult;
  settings: ConnectionSettings;
  shopifyProductUrl?: string;
  shopifyImageUrl?: string;
}): Promise<InstagramLaunchArtifact> {
  if (!input.enhancementResult.success) {
    return buildFailure(
      input.enhancementResult.errorMessage ||
        "Enhancement failed before Instagram execution."
    );
  }

  if (!isInstagramEnabled()) {
    return buildFailure("Instagram execution is disabled (INSTAGRAM_ENABLED=false).");
  }

  const accessToken = input.settings.instagramAccessToken.trim();
  const businessAccountId = input.settings.instagramBusinessAccountId.trim();
  if (!accessToken || !businessAccountId) {
    return buildFailure("Instagram credentials are missing.");
  }

  const imageUrl = resolveImageUrl({
    payload: input.payload,
    shopifyImageUrl: input.shopifyImageUrl,
  });
  if (!imageUrl) {
    return buildFailure(
      "Instagram requires a public image URL. Upload an image, then retry after Shopify returns an image URL."
    );
  }

  const caption = buildCaption({
    payload: input.payload,
    enhancementResult: input.enhancementResult,
    shopifyProductUrl: input.shopifyProductUrl,
  });

  const graphBase = `https://graph.facebook.com/v21.0/${businessAccountId}`;
  console.info(
    `[flowcart:instagram] publish started businessAccountId=${businessAccountId} imageUrlPresent=yes`
  );

  try {
    const createResponse = await fetch(`${graphBase}/media`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        image_url: imageUrl,
        caption,
        access_token: accessToken,
      }).toString(),
    });
    const createPayload = await readJsonResponse<InstagramCreateMediaResponse>(
      createResponse
    );
    const creationId = (createPayload?.id ?? "").trim();
    if (!createResponse.ok || !creationId) {
      return buildFailure(normalizeGraphError(createPayload, createResponse.status));
    }

    const publishResponse = await fetch(`${graphBase}/media_publish`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        creation_id: creationId,
        access_token: accessToken,
      }).toString(),
    });
    const publishPayload = await readJsonResponse<InstagramPublishResponse>(
      publishResponse
    );
    const postId = (publishPayload?.id ?? creationId).trim();
    if (!publishResponse.ok || !postId) {
      return buildFailure(normalizeGraphError(publishPayload, publishResponse.status));
    }

    return {
      instagramPublished: true,
      instagramPostId: postId,
      instagramPostUrl: `https://www.instagram.com/p/${postId}/`,
      adapterMode: "live",
      errorMessage: "",
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error.";
    return buildFailure(`Instagram publish failed: ${message}`);
  }
}
