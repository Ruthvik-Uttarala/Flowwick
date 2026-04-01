import { LaunchPayload, EnhancementResult, ConnectionSettings } from "@/src/lib/types";
import { normalizeStoreDomain } from "@/src/lib/server/runtime";
import { readStoredUpload } from "@/src/lib/server/uploads";

export interface ShopifyLaunchArtifact {
  shopifyCreated: boolean;
  shopifyProductId: string;
  shopifyProductUrl: string;
  adapterMode: "live";
  errorMessage: string;
  shopifyImageUrl?: string;
}

interface ShopifyTokenResponse {
  access_token?: string;
  token_type?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
}

interface ShopifyProductImage {
  id?: number | string;
  src?: string;
}

interface ShopifyProductResponse {
  product?: {
    id?: number | string;
    admin_graphql_api_id?: string;
    handle?: string;
    images?: ShopifyProductImage[];
    image?: ShopifyProductImage;
  };
  errors?: unknown;
}

function buildFailure(message: string): ShopifyLaunchArtifact {
  return {
    shopifyCreated: false,
    shopifyProductId: "",
    shopifyProductUrl: "",
    adapterMode: "live",
    errorMessage: message,
  };
}

function redactDomain(domain: string): string {
  const normalized = normalizeStoreDomain(domain);
  return normalized || "missing-store-domain";
}

function isPublicUrl(url: string): boolean {
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

function normalizeShopifyError(payload: unknown, status: number): string {
  if (!payload || typeof payload !== "object") {
    return `Shopify request failed with status ${status}.`;
  }

  const candidate = payload as { errors?: unknown; error?: unknown };
  if (candidate.errors) {
    if (typeof candidate.errors === "string") {
      return candidate.errors;
    }
    try {
      return JSON.stringify(candidate.errors);
    } catch {
      return `Shopify request failed with status ${status}.`;
    }
  }

  if (typeof candidate.error === "string") {
    return candidate.error;
  }

  return `Shopify request failed with status ${status}.`;
}

function safeBase64(buffer: Buffer): string {
  return buffer.toString("base64");
}

async function buildShopifyImageInput(imageUrl: string): Promise<
  | { src: string }
  | { attachment: string; filename: string; content_type: string }
  | null
> {
  if (!imageUrl.trim()) {
    return null;
  }

  if (isPublicUrl(imageUrl)) {
    return { src: imageUrl.trim() };
  }

  const storedUpload = await readStoredUpload(imageUrl);
  if (!storedUpload) {
    return null;
  }

  return {
    attachment: safeBase64(storedUpload.buffer),
    filename: storedUpload.fileName,
    content_type: storedUpload.contentType,
  };
}

export async function getShopifyAccessToken(
  settings: ConnectionSettings
): Promise<{ ok: true; accessToken: string } | { ok: false; errorMessage: string }> {
  const storeDomain = normalizeStoreDomain(settings.shopifyStoreDomain);
  const clientId = (settings.shopifyClientId ?? "").trim();
  const clientSecret = (settings.shopifyClientSecret ?? "").trim();

  if (!storeDomain) {
    return { ok: false, errorMessage: "Shopify store domain is missing." };
  }
  if (!clientId || !clientSecret) {
    return {
      ok: false,
      errorMessage: "Shopify client credentials are missing.",
    };
  }

  const endpoint = `https://${storeDomain}/admin/oauth/access_token`;
  const tokenBody = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: clientId,
    client_secret: clientSecret,
  });
  console.info(
    `[flowcart:shopify] token request started store=${redactDomain(storeDomain)}`
  );

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: tokenBody.toString(),
    });
    const payload = await readJsonResponse<ShopifyTokenResponse>(response);
    if (!response.ok) {
      return {
        ok: false,
        errorMessage:
          normalizeShopifyError(payload, response.status) ||
          "Shopify token request failed.",
      };
    }

    const accessToken = (payload?.access_token ?? "").trim();
    if (!accessToken) {
      return {
        ok: false,
        errorMessage:
          "Shopify token response did not include access_token.",
      };
    }

    return { ok: true, accessToken };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error.";
    return {
      ok: false,
      errorMessage: `Shopify token request failed: ${message}`,
    };
  }
}

function buildProductTitle(payload: LaunchPayload, result: EnhancementResult): string {
  const title = result.enhancedTitle.trim() || payload.titleRaw.trim();
  return title.slice(0, 255) || "FlowCart Product";
}

function buildProductBodyHtml(payload: LaunchPayload, result: EnhancementResult): string {
  const description =
    result.enhancedDescription.trim() || payload.descriptionRaw.trim();
  return description.replace(/\n/g, "<br />");
}

export async function createShopifyProductArtifact(input: {
  payload: LaunchPayload;
  enhancementResult: EnhancementResult;
  settings: ConnectionSettings;
}): Promise<ShopifyLaunchArtifact> {
  if (!input.enhancementResult.success) {
    return buildFailure(
      input.enhancementResult.errorMessage ||
        "Enhancement failed before Shopify execution."
    );
  }

  const storeDomain = normalizeStoreDomain(input.settings.shopifyStoreDomain);
  if (!storeDomain) {
    return buildFailure("Shopify store domain is missing.");
  }

  const tokenResult = await getShopifyAccessToken(input.settings);
  if (!tokenResult.ok) {
    return buildFailure(tokenResult.errorMessage);
  }

  const productEndpoint = `https://${storeDomain}/admin/api/2024-01/products.json`;
  const imageCandidate = input.payload.imageUrls[0] ?? "";
  const imageInput = await buildShopifyImageInput(imageCandidate);
  const productBody: Record<string, unknown> = {
    product: {
      title: buildProductTitle(input.payload, input.enhancementResult),
      body_html: buildProductBodyHtml(input.payload, input.enhancementResult),
      status: "active",
      variants: [
        {
          price: input.payload.price.toFixed(2),
          inventory_quantity: input.payload.quantity,
        },
      ],
      images: imageInput ? [imageInput] : [],
    },
  };

  console.info(
    `[flowcart:shopify] product create started store=${redactDomain(
      storeDomain
    )} imageSource=${imageInput ? (isPublicUrl(imageCandidate) ? "public-url" : "local-attachment") : "none"}`
  );

  try {
    const response = await fetch(productEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": tokenResult.accessToken,
      },
      body: JSON.stringify(productBody),
    });
    const payload = await readJsonResponse<ShopifyProductResponse>(response);
    if (!response.ok) {
      return buildFailure(normalizeShopifyError(payload, response.status));
    }

    const product = payload?.product;
    const rawId =
      product?.id != null
        ? String(product.id)
        : (product?.admin_graphql_api_id ?? "");
    if (!rawId) {
      return buildFailure("Shopify response did not include product id.");
    }

    const handle = (product?.handle ?? "").trim();
    const productUrl = handle
      ? `https://${storeDomain}/products/${handle}`
      : "";
    const primaryImage =
      product?.image?.src ||
      (Array.isArray(product?.images) && product?.images.length > 0
        ? product.images[0]?.src || ""
        : "");

    return {
      shopifyCreated: true,
      shopifyProductId: rawId,
      shopifyProductUrl: productUrl,
      adapterMode: "live",
      errorMessage: "",
      shopifyImageUrl: primaryImage || undefined,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error.";
    return buildFailure(`Shopify product creation failed: ${message}`);
  }
}
