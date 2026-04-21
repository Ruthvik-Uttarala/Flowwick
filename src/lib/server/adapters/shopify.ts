import { LaunchPayload, ConnectionSettings } from "@/src/lib/types";
import { normalizeStoreDomain } from "@/src/lib/server/runtime";
import { fetchShopifyAdminGraphQL } from "@/src/lib/server/shopify";

export interface ShopifyLaunchArtifact {
  shopifyCreated: boolean;
  shopifyProductId: string;
  shopifyProductUrl: string;
  adapterMode: "live";
  errorMessage: string;
  warningMessage?: string;
  shopifyImageUrl?: string;
}

interface ShopifyUserError {
  field?: string[] | null;
  message?: string | null;
}

interface ShopifyProductSetMutation {
  productSet?: {
    product?: {
      id?: string | null;
    } | null;
    userErrors?: ShopifyUserError[] | null;
  } | null;
}

interface ShopifyPublicationsQuery {
  publications?: {
    nodes?: Array<{
      id?: string | null;
      channels?: {
        nodes?: Array<{ name?: string | null; handle?: string | null }>;
      } | null;
    }>;
  };
}

interface ShopifyPublishMutation {
  publishablePublish?: {
    userErrors?: ShopifyUserError[] | null;
  } | null;
}

interface ShopifyProductQuery {
  product?: {
    id?: string | null;
    handle?: string | null;
    onlineStoreUrl?: string | null;
    media?: {
      nodes?: Array<{
        image?: { url?: string | null } | null;
      }>;
    } | null;
  } | null;
}

interface ShopifyProductUpdateMutation {
  productUpdate?: {
    product?: {
      id?: string | null;
    } | null;
    userErrors?: ShopifyUserError[] | null;
  } | null;
}

interface ShopifyProductForUpdateQuery {
  product?: {
    id?: string | null;
    handle?: string | null;
    onlineStoreUrl?: string | null;
    media?: {
      nodes?: Array<{
        image?: { url?: string | null } | null;
      }>;
    } | null;
    variants?: {
      nodes?: Array<{
        id?: string | null;
        inventoryItem?: { id?: string | null } | null;
      }>;
    } | null;
  } | null;
}

interface ShopifyVariantBulkUpdateMutation {
  productVariantsBulkUpdate?: {
    userErrors?: ShopifyUserError[] | null;
  } | null;
}

interface ShopifyLocationsQuery {
  locations?: {
    nodes?: Array<{ id?: string | null }>;
  } | null;
}

interface ShopifyInventorySetQuantitiesMutation {
  inventorySetQuantities?: {
    userErrors?: ShopifyUserError[] | null;
  } | null;
}

const CREATE_PRODUCT_MUTATION = `
  mutation CreateFlowCartProduct($input: ProductSetInput!, $synchronous: Boolean!) {
    productSet(input: $input, synchronous: $synchronous) {
      product {
        id
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const GET_PUBLICATIONS_QUERY = `
  query GetPublications {
    publications(first: 10) {
      nodes {
        id
        channels(first: 3) {
          nodes {
            name
            handle
          }
        }
      }
    }
  }
`;

const PUBLISH_PRODUCT_MUTATION = `
  mutation PublishProduct($id: ID!, $input: [PublicationInput!]!) {
    publishablePublish(id: $id, input: $input) {
      userErrors {
        field
        message
      }
    }
  }
`;

const GET_PRODUCT_DETAILS_QUERY = `
  query GetProductDetails($id: ID!) {
    product(id: $id) {
      id
      handle
      onlineStoreUrl
      media(first: 1) {
        nodes {
          ... on MediaImage {
            image {
              url
            }
          }
        }
      }
    }
  }
`;

const GET_PRODUCT_FOR_UPDATE_QUERY = `
  query GetProductForUpdate($id: ID!) {
    product(id: $id) {
      id
      handle
      onlineStoreUrl
      media(first: 1) {
        nodes {
          ... on MediaImage {
            image {
              url
            }
          }
        }
      }
      variants(first: 1) {
        nodes {
          id
          inventoryItem {
            id
          }
        }
      }
    }
  }
`;

const UPDATE_PRODUCT_MUTATION = `
  mutation UpdateFlowCartProduct($input: ProductUpdateInput!) {
    productUpdate(product: $input) {
      product {
        id
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const UPDATE_VARIANT_PRICE_MUTATION = `
  mutation UpdateFlowCartVariantPrice($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
    productVariantsBulkUpdate(productId: $productId, variants: $variants) {
      userErrors {
        field
        message
      }
    }
  }
`;

const GET_LOCATIONS_QUERY = `
  query GetLocationsForInventory {
    locations(first: 1) {
      nodes {
        id
      }
    }
  }
`;

const SET_INVENTORY_QUANTITY_MUTATION = `
  mutation SetFlowCartInventoryQuantity($input: InventorySetQuantitiesInput!) {
    inventorySetQuantities(input: $input) {
      userErrors {
        field
        message
      }
    }
  }
`;

function buildFailure(message: string): ShopifyLaunchArtifact {
  return {
    shopifyCreated: false,
    shopifyProductId: "",
    shopifyProductUrl: "",
    adapterMode: "live",
    errorMessage: message,
  };
}

function hasPublicUrl(url: string): boolean {
  return /^https?:\/\//i.test(url.trim());
}

function normalizeUserErrors(errors: ShopifyUserError[] | null | undefined): string {
  if (!errors || errors.length === 0) return "";
  return errors
    .map((error) => {
      const path = Array.isArray(error.field) && error.field.length > 0
        ? `${error.field.join(".")}: `
        : "";
      return `${path}${error.message ?? "Unknown Shopify error."}`.trim();
    })
    .join(" | ");
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function looksLikeInventoryPermissionFailure(message: string): boolean {
  const lowered = message.toLowerCase();
  return (
    lowered.includes("access denied") ||
    lowered.includes("locations field") ||
    lowered.includes("inventorysetquantities") ||
    lowered.includes("inventory") ||
    lowered.includes("location")
  );
}

function buildInventoryPermissionWarning(message: string): string {
  const normalized = normalizeWhitespace(message);
  if (normalized.toLowerCase().includes("locations field")) {
    return "Inventory quantity was not updated because this Shopify connection cannot access inventory locations (Access denied for locations field).";
  }
  return `Inventory quantity was not updated due to Shopify inventory/location permissions: ${normalized}`;
}

function buildInventorySkippedWarning(message: string): string {
  return `Inventory quantity update was skipped: ${normalizeWhitespace(message)}`;
}

function pickPrimaryImageUrl(imageUrls: string[]): string {
  return imageUrls.find((url) => hasPublicUrl(url))?.trim() ?? "";
}

function toShopifyPrice(price: number): number {
  return Number(price.toFixed(2));
}

function pickOnlineStorePublication(
  publications: ShopifyPublicationsQuery["publications"]
): string {
  const nodes = publications?.nodes ?? [];
  const publication = nodes.find((candidate) => {
    const channels = candidate.channels?.nodes ?? [];
    return (
      channels.some((channel) => {
        const channelName = channel.name?.toLowerCase() ?? "";
        const channelHandle = channel.handle?.toLowerCase() ?? "";
        return (
          channelName.includes("online store") ||
          channelHandle.includes("online-store") ||
          channelHandle === "online_store"
        );
      })
    );
  });

  return publication?.id?.trim() ?? "";
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
    return buildFailure("Shopify authorization is required before launch.");
  }

  const title = input.payload.title.trim();
  const descriptionHtml = input.payload.description.trim().replace(/\n/g, "<br />");
  const quantity = Number.isInteger(input.payload.quantity) ? input.payload.quantity : -1;
  const price = Number.isFinite(input.payload.price) ? input.payload.price : NaN;
  const imageUrl = pickPrimaryImageUrl(input.payload.imageUrls);

  if (!title) {
    return buildFailure("Shopify product title is required.");
  }
  if (!Number.isFinite(price) || price < 0) {
    return buildFailure("Shopify product price must be a valid non-negative number.");
  }
  if (!Number.isInteger(quantity) || quantity <= 0) {
    return buildFailure("Shopify product quantity must be a positive integer.");
  }
  if (!imageUrl) {
    return buildFailure("Shopify product creation requires at least one public image URL.");
  }

  try {
    const createData = await fetchShopifyAdminGraphQL<ShopifyProductSetMutation>({
      shopDomain: storeDomain,
      adminToken,
      query: CREATE_PRODUCT_MUTATION,
      variables: {
        synchronous: true,
        input: {
          title,
          descriptionHtml,
          status: "ACTIVE",
          files: [
            {
              originalSource: imageUrl,
              contentType: "IMAGE",
              alt: title.slice(0, 512),
            },
          ],
          productOptions: [
            {
              name: "Title",
              position: 1,
              values: [{ name: "Default Title" }],
            },
          ],
          variants: [
            {
              optionValues: [
                {
                  optionName: "Title",
                  name: "Default Title",
                },
              ],
              price: toShopifyPrice(price),
            },
          ],
        },
      },
    });

    const createErrors = normalizeUserErrors(createData.productSet?.userErrors);
    if (createErrors) {
      return buildFailure(createErrors);
    }

    const productId = createData.productSet?.product?.id?.trim() ?? "";
    if (!productId) {
      return buildFailure("Shopify did not return a product id.");
    }

    const publicationData = await fetchShopifyAdminGraphQL<ShopifyPublicationsQuery>({
      shopDomain: storeDomain,
      adminToken,
      query: GET_PUBLICATIONS_QUERY,
    });

    const publicationId = pickOnlineStorePublication(publicationData.publications);
    if (!publicationId) {
      return buildFailure("Shopify Online Store publication is unavailable for this store.");
    }

    const publishData = await fetchShopifyAdminGraphQL<ShopifyPublishMutation>({
      shopDomain: storeDomain,
      adminToken,
      query: PUBLISH_PRODUCT_MUTATION,
      variables: {
        id: productId,
        input: [{ publicationId }],
      },
    });

    const publishErrors = normalizeUserErrors(publishData.publishablePublish?.userErrors);
    if (publishErrors) {
      return buildFailure(publishErrors);
    }

    const detailsData = await fetchShopifyAdminGraphQL<ShopifyProductQuery>({
      shopDomain: storeDomain,
      adminToken,
      query: GET_PRODUCT_DETAILS_QUERY,
      variables: { id: productId },
    });

    const product = detailsData.product;
    const handle = product?.handle?.trim() ?? "";
    const productUrl =
      product?.onlineStoreUrl?.trim() ||
      (handle ? `https://${storeDomain}/products/${handle}` : "");
    const primaryImageUrl =
      product?.media?.nodes?.[0]?.image?.url?.trim() || imageUrl;

    if (!productUrl) {
      return buildFailure("Shopify product was created but no storefront URL was returned.");
    }

    return {
      shopifyCreated: true,
      shopifyProductId: productId,
      shopifyProductUrl: productUrl,
      adapterMode: "live",
      errorMessage: "",
      shopifyImageUrl: primaryImageUrl || undefined,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error.";
    return buildFailure(`Shopify product creation failed: ${message}`);
  }
}

export async function updateShopifyProductArtifact(input: {
  payload: LaunchPayload;
  settings: ConnectionSettings;
  existingProductId: string;
}): Promise<ShopifyLaunchArtifact> {
  const storeDomain = normalizeStoreDomain(input.settings.shopifyStoreDomain);
  if (!storeDomain) {
    return buildFailure("Shopify store domain is missing.");
  }

  const adminToken = input.settings.shopifyAdminToken.trim();
  if (!adminToken) {
    return buildFailure("Shopify authorization is required before update.");
  }

  const existingProductId = input.existingProductId.trim();
  if (!existingProductId) {
    return buildFailure("Shopify product id is missing for update.");
  }

  const title = input.payload.title.trim();
  const descriptionHtml = input.payload.description.trim().replace(/\n/g, "<br />");
  const quantity = Number.isInteger(input.payload.quantity) ? input.payload.quantity : -1;
  const price = Number.isFinite(input.payload.price) ? input.payload.price : NaN;
  const imageUrl = pickPrimaryImageUrl(input.payload.imageUrls);

  if (!title) {
    return buildFailure("Shopify product title is required.");
  }
  if (!Number.isFinite(price) || price < 0) {
    return buildFailure("Shopify product price must be a valid non-negative number.");
  }
  if (!Number.isInteger(quantity) || quantity <= 0) {
    return buildFailure("Shopify product quantity must be a positive integer.");
  }

  try {
    const syncWarnings: string[] = [];

    const beforeUpdate = await fetchShopifyAdminGraphQL<ShopifyProductForUpdateQuery>({
      shopDomain: storeDomain,
      adminToken,
      query: GET_PRODUCT_FOR_UPDATE_QUERY,
      variables: { id: existingProductId },
    });
    const existingProduct = beforeUpdate.product;
    if (!existingProduct?.id?.trim()) {
      return buildFailure("Shopify product for this bucket no longer exists.");
    }

    const updateProductData = await fetchShopifyAdminGraphQL<ShopifyProductUpdateMutation>({
      shopDomain: storeDomain,
      adminToken,
      query: UPDATE_PRODUCT_MUTATION,
      variables: {
        input: {
          id: existingProductId,
          title,
          descriptionHtml,
        },
      },
    });

    const productUpdateErrors = normalizeUserErrors(updateProductData.productUpdate?.userErrors);
    if (productUpdateErrors) {
      return buildFailure(productUpdateErrors);
    }

    const variantId = existingProduct.variants?.nodes?.[0]?.id?.trim() ?? "";
    if (variantId) {
      const variantUpdateData = await fetchShopifyAdminGraphQL<ShopifyVariantBulkUpdateMutation>({
        shopDomain: storeDomain,
        adminToken,
        query: UPDATE_VARIANT_PRICE_MUTATION,
        variables: {
          productId: existingProductId,
          variants: [
            {
              id: variantId,
              price: toShopifyPrice(price),
            },
          ],
        },
      });

      const variantErrors = normalizeUserErrors(
        variantUpdateData.productVariantsBulkUpdate?.userErrors
      );
      if (variantErrors) {
        return buildFailure(variantErrors);
      }
    }

    const inventoryItemId = existingProduct.variants?.nodes?.[0]?.inventoryItem?.id?.trim() ?? "";
    if (inventoryItemId) {
      try {
        const locationsData = await fetchShopifyAdminGraphQL<ShopifyLocationsQuery>({
          shopDomain: storeDomain,
          adminToken,
          query: GET_LOCATIONS_QUERY,
        });
        const locationId = locationsData.locations?.nodes?.[0]?.id?.trim() ?? "";
        if (!locationId) {
          syncWarnings.push(
            "Inventory quantity was not updated because no accessible Shopify location was returned."
          );
        } else {
          try {
            const inventoryData =
              await fetchShopifyAdminGraphQL<ShopifyInventorySetQuantitiesMutation>({
                shopDomain: storeDomain,
                adminToken,
                query: SET_INVENTORY_QUANTITY_MUTATION,
                variables: {
                  input: {
                    name: "available",
                    reason: "correction",
                    quantities: [
                      {
                        inventoryItemId,
                        locationId,
                        quantity,
                      },
                    ],
                  },
                },
              });

            const inventoryErrors = normalizeUserErrors(
              inventoryData.inventorySetQuantities?.userErrors
            );
            if (inventoryErrors) {
              syncWarnings.push(
                looksLikeInventoryPermissionFailure(inventoryErrors)
                  ? buildInventoryPermissionWarning(inventoryErrors)
                  : buildInventorySkippedWarning(inventoryErrors)
              );
            }
          } catch (error) {
            const message =
              error instanceof Error
                ? normalizeWhitespace(error.message)
                : "Unknown inventory update failure.";
            syncWarnings.push(
              looksLikeInventoryPermissionFailure(message)
                ? buildInventoryPermissionWarning(message)
                : buildInventorySkippedWarning(message)
            );
          }
        }
      } catch (error) {
        const message =
          error instanceof Error ? normalizeWhitespace(error.message) : "Unknown location lookup failure.";
        syncWarnings.push(
          looksLikeInventoryPermissionFailure(message)
            ? buildInventoryPermissionWarning(message)
            : buildInventorySkippedWarning(message)
        );
      }
    }

    if (imageUrl) {
      await fetchShopifyAdminGraphQL<ShopifyProductSetMutation>({
        shopDomain: storeDomain,
        adminToken,
        query: CREATE_PRODUCT_MUTATION,
        variables: {
          synchronous: true,
          input: {
            identifier: { id: existingProductId },
            files: [
              {
                originalSource: imageUrl,
                contentType: "IMAGE",
                alt: title.slice(0, 512),
              },
            ],
          },
        },
      }).catch(() => null);
    }

    const detailsData = await fetchShopifyAdminGraphQL<ShopifyProductQuery>({
      shopDomain: storeDomain,
      adminToken,
      query: GET_PRODUCT_DETAILS_QUERY,
      variables: { id: existingProductId },
    });

    const product = detailsData.product;
    const productId = product?.id?.trim() ?? existingProductId;
    const handle = product?.handle?.trim() ?? "";
    const productUrl =
      product?.onlineStoreUrl?.trim() ||
      (handle ? `https://${storeDomain}/products/${handle}` : "");
    const primaryImageUrl =
      product?.media?.nodes?.[0]?.image?.url?.trim() || imageUrl;

    if (!productUrl) {
      return buildFailure("Shopify product was updated but no storefront URL was returned.");
    }

    return {
      shopifyCreated: true,
      shopifyProductId: productId,
      shopifyProductUrl: productUrl,
      adapterMode: "live",
      errorMessage: "",
      warningMessage:
        syncWarnings.length > 0 ? Array.from(new Set(syncWarnings)).join(" ") : undefined,
      shopifyImageUrl: primaryImageUrl || undefined,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error.";
    return buildFailure(`Shopify product update failed: ${message}`);
  }
}
