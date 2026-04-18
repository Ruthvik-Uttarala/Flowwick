import { ActiveInstagramCredentials, LaunchPayload } from "@/src/lib/types";
import { isInstagramEnabled } from "@/src/lib/server/runtime";
import {
  buildInstagramCaption,
  INSTAGRAM_GRAPH_API_VERSION,
  normalizeInstagramGraphError,
  pollInstagramContainerStatus,
  readInstagramJsonResponse,
  selectInstagramImageUrl,
} from "@/src/lib/server/instagram-publish";

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

type InstagramPublishStage = "create" | "container-status" | "publish" | "permalink";

function buildFailure(message: string): InstagramLaunchArtifact {
  return {
    instagramPublished: false,
    instagramPostId: "",
    instagramPostUrl: "",
    adapterMode: "live",
    errorMessage: message,
  };
}

function logInstagramPublish(
  stage: InstagramPublishStage,
  details: Record<string, unknown>,
  outcome: "success" | "failure" | "warning" = "success"
): void {
  const logger = outcome === "failure" ? console.warn : outcome === "warning" ? console.warn : console.info;
  logger("[flowcart:instagram:publish]", { stage, outcome, ...details });
}

function buildFailureWithLog(
  stage: InstagramPublishStage,
  message: string,
  details: Record<string, unknown>
): InstagramLaunchArtifact {
  logInstagramPublish(stage, { ...details, message }, "failure");
  return buildFailure(message);
}

export async function publishInstagramPostArtifact(input: {
  payload: LaunchPayload;
  instagramCredentials: ActiveInstagramCredentials | null;
  shopifyProductUrl?: string;
  shopifyImageUrl?: string;
}): Promise<InstagramLaunchArtifact> {
  if (!isInstagramEnabled()) {
    return buildFailure("Instagram execution is disabled (INSTAGRAM_ENABLED=false).");
  }

  if (!input.instagramCredentials) {
    return buildFailureWithLog("create", "Instagram credentials are missing.", {
      businessAccountId: "",
      urlSource: "",
      httpStatus: null,
      graphCode: null,
      graphSubcode: null,
      transient: false,
    });
  }

  const accessToken = input.instagramCredentials.publishAccessToken.trim();
  if (!accessToken) {
    return buildFailureWithLog("create", "Instagram publish access token is missing.", {
      businessAccountId: input.instagramCredentials.instagramBusinessAccountId,
      urlSource: "",
      httpStatus: null,
      graphCode: null,
      graphSubcode: null,
      transient: false,
    });
  }

  const businessAccountId = input.instagramCredentials.instagramBusinessAccountId.trim();
  if (!businessAccountId) {
    return buildFailureWithLog("create", "Instagram business account id is missing.", {
      businessAccountId: "",
      urlSource: "",
      httpStatus: null,
      graphCode: null,
      graphSubcode: null,
      transient: false,
    });
  }

  const selectedImage = selectInstagramImageUrl(input.payload, input.shopifyImageUrl);
  if (!selectedImage) {
    return buildFailureWithLog(
      "create",
      "Instagram requires an external public HTTPS image URL that Meta can fetch. Upload a valid image and retry.",
      {
        businessAccountId,
        urlSource: "",
        httpStatus: null,
        graphCode: null,
        graphSubcode: null,
        transient: false,
      }
    );
  }

  const caption = buildInstagramCaption(input.payload, input.shopifyProductUrl);
  const graphBase = `https://graph.facebook.com/${INSTAGRAM_GRAPH_API_VERSION}/${businessAccountId}`;

  try {
    const createResponse = await fetch(`${graphBase}/media`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        image_url: selectedImage.imageUrl,
        caption,
        access_token: accessToken,
      }).toString(),
    });

    const createPayload = await readInstagramJsonResponse<InstagramCreateMediaResponse>(
      createResponse
    );
    const creationId = (createPayload?.id ?? "").trim();

    if (!createResponse.ok || createPayload?.error) {
      const normalized = normalizeInstagramGraphError(createPayload, createResponse.status, "create");
      return buildFailureWithLog("create", normalized.message, {
        businessAccountId,
        urlSource: selectedImage.source,
        httpStatus: normalized.status,
        graphCode: normalized.code,
        graphSubcode: normalized.subcode,
        transient: normalized.isTransient,
      });
    }

    if (!creationId) {
      return buildFailureWithLog(
        "create",
        "Instagram media container creation failed: Instagram did not return a valid creation id.",
        {
          businessAccountId,
          urlSource: selectedImage.source,
          httpStatus: createResponse.status,
          graphCode: null,
          graphSubcode: null,
          transient: false,
        }
      );
    }

    logInstagramPublish("create", {
      businessAccountId,
      urlSource: selectedImage.source,
      httpStatus: createResponse.status,
      graphCode: null,
      graphSubcode: null,
      transient: false,
      creationId,
    });

    const pollResult = await pollInstagramContainerStatus({
      creationId,
      accessToken,
    });

    if (!pollResult.ok) {
      return buildFailureWithLog("container-status", pollResult.error.message, {
        businessAccountId,
        urlSource: selectedImage.source,
        httpStatus: pollResult.error.status,
        graphCode: pollResult.error.code,
        graphSubcode: pollResult.error.subcode,
        transient: pollResult.error.isTransient,
        containerStatus: pollResult.statusCode,
        attempts: pollResult.attempts,
      });
    }

    logInstagramPublish("container-status", {
      businessAccountId,
      urlSource: selectedImage.source,
      httpStatus: 200,
      graphCode: null,
      graphSubcode: null,
      transient: false,
      containerStatus: pollResult.statusCode,
      attempts: pollResult.attempts,
    });

    const publishResponse = await fetch(`${graphBase}/media_publish`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        creation_id: creationId,
        access_token: accessToken,
      }).toString(),
    });

    const publishPayload = await readInstagramJsonResponse<InstagramPublishResponse>(
      publishResponse
    );
    const postId = (publishPayload?.id ?? "").trim();

    if (!publishResponse.ok || publishPayload?.error) {
      const normalized = normalizeInstagramGraphError(
        publishPayload,
        publishResponse.status,
        "publish"
      );
      return buildFailureWithLog("publish", normalized.message, {
        businessAccountId,
        urlSource: selectedImage.source,
        httpStatus: normalized.status,
        graphCode: normalized.code,
        graphSubcode: normalized.subcode,
        transient: normalized.isTransient,
      });
    }

    if (!postId) {
      return buildFailureWithLog(
        "publish",
        "Instagram publish failed: Instagram did not return a valid media id.",
        {
          businessAccountId,
          urlSource: selectedImage.source,
          httpStatus: publishResponse.status,
          graphCode: null,
          graphSubcode: null,
          transient: false,
        }
      );
    }

    logInstagramPublish("publish", {
      businessAccountId,
      urlSource: selectedImage.source,
      httpStatus: publishResponse.status,
      graphCode: null,
      graphSubcode: null,
      transient: false,
      postId,
    });

    const detailsResponse = await fetch(
      `https://graph.facebook.com/${INSTAGRAM_GRAPH_API_VERSION}/${postId}?${new URLSearchParams({
        fields: "permalink",
        access_token: accessToken,
      }).toString()}`
    );
    const detailsPayload = await readInstagramJsonResponse<InstagramMediaDetailsResponse>(
      detailsResponse
    );
    const permalink =
      detailsResponse.ok && !detailsPayload?.error ? detailsPayload?.permalink?.trim() ?? "" : "";

    if (!detailsResponse.ok || detailsPayload?.error) {
      const normalized = normalizeInstagramGraphError(
        detailsPayload,
        detailsResponse.status,
        "permalink"
      );
      logInstagramPublish(
        "permalink",
        {
          businessAccountId,
          urlSource: selectedImage.source,
          httpStatus: normalized.status,
          graphCode: normalized.code,
          graphSubcode: normalized.subcode,
          transient: normalized.isTransient,
          postId,
        },
        "warning"
      );
    } else {
      logInstagramPublish("permalink", {
        businessAccountId,
        urlSource: selectedImage.source,
        httpStatus: detailsResponse.status,
        graphCode: null,
        graphSubcode: null,
        transient: false,
        postId,
        hasPermalink: Boolean(permalink),
      });
    }

    return {
      instagramPublished: true,
      instagramPostId: postId,
      instagramPostUrl: permalink,
      adapterMode: "live",
      errorMessage: "",
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error.";
    return buildFailureWithLog("publish", `Instagram publish failed: ${message}`, {
      businessAccountId,
      urlSource: selectedImage.source,
      httpStatus: null,
      graphCode: null,
      graphSubcode: null,
      transient: false,
    });
  }
}
