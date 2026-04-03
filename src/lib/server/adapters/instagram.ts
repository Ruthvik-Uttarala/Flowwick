import { LaunchPayload, ConnectionSettings } from "@/src/lib/types";
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

interface InstagramMediaDetailsResponse {
  permalink?: string;
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
  if (!candidate.error) return `Instagram request failed with status ${status}.`;
  try {
    const serialized = JSON.stringify(candidate.error);
    return serialized === "{}"
      ? `Instagram request failed with status ${status}.`
      : serialized;
  } catch {
    return `Instagram request failed with status ${status}.`;
  }
}

function resolveImageUrl(payload: LaunchPayload, shopifyImageUrl?: string): string {
  if (shopifyImageUrl && hasPublicUrl(shopifyImageUrl)) return shopifyImageUrl.trim();
  const fromPayload = payload.imageUrls.find((url) => hasPublicUrl(url));
  return fromPayload?.trim() ?? "";
}

function buildCaption(payload: LaunchPayload, shopifyProductUrl?: string): string {
  const lines = [
    payload.title,
    payload.description,
    `Price: $${payload.price.toFixed(2)}`,
    `Quantity: ${payload.quantity}`,
  ];
  if (shopifyProductUrl?.trim()) {
    lines.push(`Shop now: ${shopifyProductUrl.trim()}`);
  }
  return lines.filter((l) => l.trim().length > 0).join("\n\n");
}

export async function publishInstagramPostArtifact(input: {
  payload: LaunchPayload;
  settings: ConnectionSettings;
  shopifyProductUrl?: string;
  shopifyImageUrl?: string;
}): Promise<InstagramLaunchArtifact> {
  if (!isInstagramEnabled()) {
    return buildFailure("Instagram execution is disabled (INSTAGRAM_ENABLED=false).");
  }

  const accessToken = input.settings.instagramAccessToken.trim();
  const businessAccountId = input.settings.instagramBusinessAccountId.trim();
  if (!accessToken || !businessAccountId) {
    return buildFailure("Instagram credentials are missing.");
  }

  const imageUrl = resolveImageUrl(input.payload, input.shopifyImageUrl);
  if (!imageUrl) {
    return buildFailure(
      "Instagram requires a public image URL. Upload an image and retry after Shopify returns an image URL."
    );
  }

  const caption = buildCaption(input.payload, input.shopifyProductUrl);
  const graphBase = `https://graph.facebook.com/v21.0/${businessAccountId}`;

  try {
    const createResponse = await fetch(`${graphBase}/media`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        image_url: imageUrl,
        caption,
        access_token: accessToken,
      }).toString(),
    });

    const createPayload = await readJsonResponse<InstagramCreateMediaResponse>(createResponse);
    const creationId = (createPayload?.id ?? "").trim();

    if (!createResponse.ok || !creationId) {
      return buildFailure(normalizeGraphError(createPayload, createResponse.status));
    }

    const publishResponse = await fetch(`${graphBase}/media_publish`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        creation_id: creationId,
        access_token: accessToken,
      }).toString(),
    });

    const publishPayload = await readJsonResponse<InstagramPublishResponse>(publishResponse);
    const postId = (publishPayload?.id ?? creationId).trim();

    if (!publishResponse.ok || !postId) {
      return buildFailure(normalizeGraphError(publishPayload, publishResponse.status));
    }

    const detailsResponse = await fetch(
      `https://graph.facebook.com/v21.0/${postId}?${new URLSearchParams({
        fields: "permalink",
        access_token: accessToken,
      }).toString()}`
    );
    const detailsPayload = await readJsonResponse<InstagramMediaDetailsResponse>(detailsResponse);
    const permalink = detailsResponse.ok ? detailsPayload?.permalink?.trim() ?? "" : "";

    return {
      instagramPublished: true,
      instagramPostId: postId,
      instagramPostUrl: permalink,
      adapterMode: "live",
      errorMessage: "",
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error.";
    return buildFailure(`Instagram publish failed: ${message}`);
  }
}
