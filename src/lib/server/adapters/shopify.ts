import { LaunchPayload, ConnectionSettings } from "@/src/lib/types";
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
    if (typeof candidate.errors === "string") return candidate.errors;
    try {
      return JSON.stringify(candidate.errors);
    } catch {
      return `Shopify request failed with status ${status}.`;
    }
  }
  if (typeof candidate.error === "string") return candidate.error;
  return `Shopify request failed with status ${status}.`;
}

async function buildShopifyImageInput(imageUrl: string): Promise<
  | { src: string }
  | { attachment: string; filename: string; content_type: string }
  | null
> {
  if (!imageUrl.trim()) return null;

  if (isPublicUrl(imageUrl)) {
    return { src: imageUrl.trim() };
  }

  const storedUpload = await readStoredUpload(imageUrl);
  if (!storedUpload) return null;

  return {
    attachment: storedUpload.buffer.toString("base64"),
    filename: storedUpload.fileName,
    content_type: storedUpload.contentType,
  };
}

export async function createShopifyProductArtifact(input: {
  payload: LaunchPayload;
  settings: ConnectionSettings;
}): Promise<ShopifyLaunchArtifact> {
  const storeDomain = normalizeStoreDomain(input.settings.shopifyStoreDomain);
  if (!storeDomain) {
    return buildFailure("Shopify store domain is missing.");
  }

  const adminToken = input.settings.shopifyAdminToken.trim();
  if (!adminToken) {
    return buildFailure("Shopify Admin API Access Token is missing.");
  }

  const title = input.payload.title.trim();
  const price = input.payload.price;
  if (!title || !price) {
    return buildFailure("Missing required fields: title and price are required.");
  }

  const imageCandidate = input.payload.imageUrls[0] ?? "";
  const imageInput = await buildShopifyImageInput(imageCandidate);

  const productBody = {
    product: {
      title,
      body_html: input.payload.description.replace(/\n/g, "<br />"),
      status: "active",
      variants: [
        {
          price: price.toFixed(2),
          inventory_quantity: input.payload.quantity,
        },
      ],
      images: imageInput ? [imageInput] : [],
    },
  };

  const productEndpoint = `https://${storeDomain}/admin/api/2024-01/products.json`;

  console.info(
    `[flowcart:shopify] creating product store=${storeDomain} title="${title}" price=${price}`
  );

  try {
    const response = await fetch(productEndpoint, {
      method: "POST",
      headers: {
        "X-Shopify-Access-Token": adminToken,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(productBody),
    });

    const payload = await readJsonResponse<ShopifyProductResponse>(response);

    if (!response.ok) {
      const errMsg = normalizeShopifyError(payload, response.status);
      console.error(`[flowcart:shopify] product creation failed status=${response.status}:`, errMsg);
      return buildFailure(errMsg);
    }

    const product = payload?.product;
    const rawId =
      product?.id != null ? String(product.id) : (product?.admin_graphql_api_id ?? "");

    if (!rawId) {
      return buildFailure("Shopify response did not include product id.");
    }

    const handle = (product?.handle ?? "").trim();
    const productUrl = handle ? `https://${storeDomain}/products/${handle}` : "";
    const primaryImage =
      product?.image?.src ||
      (Array.isArray(product?.images) && product.images.length > 0
        ? product.images[0]?.src || ""
        : "");

    console.info(`[flowcart:shopify] product created productId=${rawId} url=${productUrl}`);

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
