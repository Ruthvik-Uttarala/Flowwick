import {
  ActiveInstagramCredentials,
  InstagramEditReason,
  LaunchPayload,
} from "@/src/lib/types";
import { isInstagramEnabled } from "@/src/lib/server/runtime";
import {
  buildInstagramCaption,
  INSTAGRAM_GRAPH_API_VERSION,
  normalizeInstagramGraphError,
  pollInstagramContainerStatus,
  readInstagramJsonResponse,
  selectInstagramCarouselImageUrls,
  selectInstagramImageUrl,
} from "@/src/lib/server/instagram-publish";

export interface InstagramLaunchArtifact {
  instagramPublished: boolean;
  instagramPostId: string;
  instagramPostUrl: string;
  adapterMode: "live";
  errorMessage: string;
}

export interface InstagramEditArtifact {
  instagramUpdated: boolean;
  instagramPostId: string;
  instagramPostUrl: string;
  outcome: "updated" | "unchanged" | "failed" | "skipped";
  reason: InstagramEditReason;
  errorMessage: string;
  mediaType: string;
  mediaProductType: string;
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

interface InstagramEditMetadataResponse {
  id?: string;
  caption?: string;
  permalink?: string;
  media_type?: string;
  media_product_type?: string;
  comment_enabled?: boolean;
  error?: unknown;
}

type InstagramPublishStage = "create" | "container-status" | "publish" | "permalink";
type InstagramPublishMode = "single" | "carousel";
type InstagramContainerRole = "single" | "child" | "parent";

interface CreateContainerResult {
  ok: true;
  creationId: string;
}

interface PublishContainerResult {
  ok: true;
  postId: string;
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

function buildEditResult(input: InstagramEditArtifact): InstagramEditArtifact {
  return input;
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
      mode: "",
      containerRole: "",
      urlSource: "",
      mediaCount: 0,
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
      mode: "",
      containerRole: "",
      urlSource: "",
      mediaCount: 0,
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
      mode: "",
      containerRole: "",
      urlSource: "",
      mediaCount: 0,
      httpStatus: null,
      graphCode: null,
      graphSubcode: null,
      transient: false,
    });
  }

  const carouselImageUrls = selectInstagramCarouselImageUrls(input.payload);
  const singleBucketFallbackImage = selectInstagramImageUrl(input.payload);
  const publishMode: InstagramPublishMode =
    carouselImageUrls.length >= 2 ? "carousel" : "single";
  const selectedImage =
    publishMode === "single"
      ? selectInstagramImageUrl(input.payload, input.shopifyImageUrl)
      : null;
  const mediaCount =
    publishMode === "carousel" ? carouselImageUrls.length : selectedImage ? 1 : 0;

  if (publishMode === "single" && !selectedImage) {
    return buildFailureWithLog(
      "create",
      "Instagram requires an external public HTTPS image URL that Meta can fetch. Upload a valid image and retry.",
      {
        businessAccountId,
        mode: publishMode,
        containerRole: "single",
        urlSource: "",
        mediaCount,
        httpStatus: null,
        graphCode: null,
        graphSubcode: null,
        transient: false,
      }
    );
  }

  const caption = buildInstagramCaption(input.payload, input.shopifyProductUrl);
  const graphBase = `https://graph.facebook.com/${INSTAGRAM_GRAPH_API_VERSION}/${businessAccountId}`;

  const createContainer = async (input: {
    body: URLSearchParams;
    mode: InstagramPublishMode;
    containerRole: InstagramContainerRole;
    urlSource: string;
    mediaCount: number;
    containerIndex?: number;
  }): Promise<CreateContainerResult | InstagramLaunchArtifact> => {
    const createResponse = await fetch(`${graphBase}/media`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: input.body.toString(),
    });

    const createPayload = await readInstagramJsonResponse<InstagramCreateMediaResponse>(
      createResponse
    );
    const creationId = (createPayload?.id ?? "").trim();

    if (!createResponse.ok || createPayload?.error) {
      const normalized = normalizeInstagramGraphError(
        createPayload,
        createResponse.status,
        "create"
      );
      return buildFailureWithLog("create", normalized.message, {
        businessAccountId,
        mode: input.mode,
        containerRole: input.containerRole,
        containerIndex: input.containerIndex ?? null,
        urlSource: input.urlSource,
        mediaCount: input.mediaCount,
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
          mode: input.mode,
          containerRole: input.containerRole,
          containerIndex: input.containerIndex ?? null,
          urlSource: input.urlSource,
          mediaCount: input.mediaCount,
          httpStatus: createResponse.status,
          graphCode: null,
          graphSubcode: null,
          transient: false,
        }
      );
    }

    logInstagramPublish("create", {
      businessAccountId,
      mode: input.mode,
      containerRole: input.containerRole,
      containerIndex: input.containerIndex ?? null,
      urlSource: input.urlSource,
      mediaCount: input.mediaCount,
      httpStatus: createResponse.status,
      graphCode: null,
      graphSubcode: null,
      transient: false,
      creationId,
    });

    return { ok: true, creationId };
  };

  const pollContainer = async (input: {
    creationId: string;
    mode: InstagramPublishMode;
    containerRole: InstagramContainerRole;
    urlSource: string;
    mediaCount: number;
    containerIndex?: number;
  }): Promise<true | InstagramLaunchArtifact> => {
    const pollResult = await pollInstagramContainerStatus({
      creationId: input.creationId,
      accessToken,
    });

    if (!pollResult.ok) {
      return buildFailureWithLog("container-status", pollResult.error.message, {
        businessAccountId,
        mode: input.mode,
        containerRole: input.containerRole,
        containerIndex: input.containerIndex ?? null,
        urlSource: input.urlSource,
        mediaCount: input.mediaCount,
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
      mode: input.mode,
      containerRole: input.containerRole,
      containerIndex: input.containerIndex ?? null,
      urlSource: input.urlSource,
      mediaCount: input.mediaCount,
      httpStatus: 200,
      graphCode: null,
      graphSubcode: null,
      transient: false,
      containerStatus: pollResult.statusCode,
      attempts: pollResult.attempts,
      creationId: input.creationId,
    });

    return true;
  };

  const publishContainer = async (input: {
    creationId: string;
    mode: InstagramPublishMode;
    urlSource: string;
    mediaCount: number;
  }): Promise<PublishContainerResult | InstagramLaunchArtifact> => {
    const publishResponse = await fetch(`${graphBase}/media_publish`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        creation_id: input.creationId,
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
        mode: input.mode,
        containerRole: "parent",
        urlSource: input.urlSource,
        mediaCount: input.mediaCount,
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
          mode: input.mode,
          containerRole: "parent",
          urlSource: input.urlSource,
          mediaCount: input.mediaCount,
          httpStatus: publishResponse.status,
          graphCode: null,
          graphSubcode: null,
          transient: false,
        }
      );
    }

    logInstagramPublish("publish", {
      businessAccountId,
      mode: input.mode,
      containerRole: "parent",
      urlSource: input.urlSource,
      mediaCount: input.mediaCount,
      httpStatus: publishResponse.status,
      graphCode: null,
      graphSubcode: null,
      transient: false,
      creationId: input.creationId,
      postId,
    });

    return { ok: true, postId };
  };

  const fetchPermalink = async (input: {
    postId: string;
    mode: InstagramPublishMode;
    urlSource: string;
    mediaCount: number;
  }): Promise<string> => {
    const detailsResponse = await fetch(
      `https://graph.facebook.com/${INSTAGRAM_GRAPH_API_VERSION}/${input.postId}?${new URLSearchParams({
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
          mode: input.mode,
          containerRole: "parent",
          urlSource: input.urlSource,
          mediaCount: input.mediaCount,
          httpStatus: normalized.status,
          graphCode: normalized.code,
          graphSubcode: normalized.subcode,
          transient: normalized.isTransient,
          postId: input.postId,
        },
        "warning"
      );
      return "";
    }

    logInstagramPublish("permalink", {
      businessAccountId,
      mode: input.mode,
      containerRole: "parent",
      urlSource: input.urlSource,
      mediaCount: input.mediaCount,
      httpStatus: detailsResponse.status,
      graphCode: null,
      graphSubcode: null,
      transient: false,
      postId: input.postId,
      hasPermalink: Boolean(permalink),
    });
    return permalink;
  };

  try {
    let urlSource = publishMode === "carousel" ? "bucket" : selectedImage?.source ?? "";
    let publishableCreationId = "";

    if (publishMode === "carousel") {
      const childCreationIds: string[] = [];

      for (const [index, imageUrl] of carouselImageUrls.entries()) {
        const created = await createContainer({
          body: new URLSearchParams({
            image_url: imageUrl,
            is_carousel_item: "true",
            access_token: accessToken,
          }),
          mode: "carousel",
          containerRole: "child",
          containerIndex: index + 1,
          urlSource,
          mediaCount,
        });

        if ("instagramPublished" in created) {
          return created;
        }

        const childPolled = await pollContainer({
          creationId: created.creationId,
          mode: "carousel",
          containerRole: "child",
          containerIndex: index + 1,
          urlSource,
          mediaCount,
        });
        if (childPolled !== true) {
          return childPolled;
        }

        childCreationIds.push(created.creationId);
      }

      const createdParent = await createContainer({
        body: new URLSearchParams({
          media_type: "CAROUSEL",
          children: childCreationIds.join(","),
          caption,
          access_token: accessToken,
        }),
        mode: "carousel",
        containerRole: "parent",
        urlSource,
        mediaCount,
      });

      if ("instagramPublished" in createdParent) {
        return createdParent;
      }

      const parentPolled = await pollContainer({
        creationId: createdParent.creationId,
        mode: "carousel",
        containerRole: "parent",
        urlSource,
        mediaCount,
      });
      if (parentPolled !== true) {
        return parentPolled;
      }

      publishableCreationId = createdParent.creationId;
    } else {
      let activeSelectedImage = selectedImage;
      let created = await createContainer({
        body: new URLSearchParams({
          image_url: activeSelectedImage?.imageUrl ?? "",
          caption,
          access_token: accessToken,
        }),
        mode: "single",
        containerRole: "single",
        urlSource,
        mediaCount: 1,
      });

      if (
        "instagramPublished" in created &&
        urlSource === "shopify" &&
        singleBucketFallbackImage &&
        singleBucketFallbackImage.imageUrl !== activeSelectedImage?.imageUrl &&
        created.errorMessage.includes("Instagram could not fetch the selected image URL")
      ) {
        logInstagramPublish(
          "create",
          {
            businessAccountId,
            mode: "single",
            containerRole: "single",
            urlSource,
            fallbackUrlSource: singleBucketFallbackImage.source,
            mediaCount: 1,
            message: "Retrying single-image publish with bucket image fallback.",
          },
          "warning"
        );
        activeSelectedImage = singleBucketFallbackImage;
        urlSource = singleBucketFallbackImage.source;
        created = await createContainer({
          body: new URLSearchParams({
            image_url: activeSelectedImage.imageUrl,
            caption,
            access_token: accessToken,
          }),
          mode: "single",
          containerRole: "single",
          urlSource,
          mediaCount: 1,
        });
      }

      if ("instagramPublished" in created) {
        return created;
      }

      const polled = await pollContainer({
        creationId: created.creationId,
        mode: "single",
        containerRole: "single",
        urlSource,
        mediaCount: 1,
      });
      if (polled !== true) {
        return polled;
      }

      publishableCreationId = created.creationId;
    }

    const published = await publishContainer({
      creationId: publishableCreationId,
      mode: publishMode,
      urlSource,
      mediaCount,
    });
    if ("instagramPublished" in published) {
      return published;
    }

    const permalink = await fetchPermalink({
      postId: published.postId,
      mode: publishMode,
      urlSource,
      mediaCount,
    });

    return {
      instagramPublished: true,
      instagramPostId: published.postId,
      instagramPostUrl: permalink,
      adapterMode: "live",
      errorMessage: "",
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error.";
    return buildFailureWithLog("publish", `Instagram publish failed: ${message}`, {
      businessAccountId,
      mode: publishMode,
      containerRole: publishMode === "carousel" ? "parent" : "single",
      urlSource: publishMode === "carousel" ? "bucket" : selectedImage?.source ?? "",
      mediaCount,
      httpStatus: null,
      graphCode: null,
      graphSubcode: null,
      transient: false,
    });
  }
}

function isUnsupportedInstagramEditFailure(input: {
  graphMessage: string;
  code: number | null;
}): boolean {
  const lowered = input.graphMessage.toLowerCase();

  return (
    lowered.includes("unsupported post request") ||
    lowered.includes("cannot be edited") ||
    lowered.includes("not editable") ||
    lowered.includes("editing this media is not supported") ||
    lowered.includes("does not allow editing") ||
    lowered.includes("only supports the comment_enabled parameter") ||
    lowered.includes("cannot update this field")
  );
}

function isCommentEnabledRequiredFailure(input: {
  graphMessage: string;
  code: number | null;
}): boolean {
  const lowered = input.graphMessage.toLowerCase();
  return (
    input.code === 100 &&
    (lowered.includes("parameter comment_enabled is required") ||
      lowered.includes("the parameter comment_enabled is required"))
  );
}

function normalizeCaptionForComparison(value: string): string {
  return value.replace(/\r\n?/g, "\n").replace(/\u00a0/g, " ").trim();
}

function resolveInstagramEditMediaType(metadata: InstagramEditMetadataResponse): {
  mediaType: string;
  mediaProductType: string;
} {
  return {
    mediaType: String(metadata.media_type ?? "").trim().toUpperCase(),
    mediaProductType: String(metadata.media_product_type ?? "").trim().toUpperCase(),
  };
}

function isPotentiallyEditableInstagramMediaType(mediaType: string): boolean {
  return mediaType === "IMAGE" || mediaType === "VIDEO" || mediaType === "CAROUSEL_ALBUM";
}

export async function updateInstagramPostArtifact(input: {
  payload: LaunchPayload;
  instagramCredentials: ActiveInstagramCredentials | null;
  instagramPostId: string;
  instagramPostUrl?: string;
  shopifyProductUrl?: string;
}): Promise<InstagramEditArtifact> {
  const instagramPostId = input.instagramPostId.trim();
  const preservedPostUrl = input.instagramPostUrl?.trim() ?? "";

  const buildInstagramEditOutcome = (outcome: InstagramEditArtifact): InstagramEditArtifact =>
    buildEditResult(outcome);

  if (!instagramPostId) {
    return buildInstagramEditOutcome({
      instagramUpdated: false,
      instagramPostId: "",
      instagramPostUrl: preservedPostUrl,
      outcome: "skipped",
      reason: "missing_post_id",
      errorMessage: "Instagram post id is missing for update.",
      mediaType: "",
      mediaProductType: "",
    });
  }

  if (!isInstagramEnabled()) {
    return buildInstagramEditOutcome({
      instagramUpdated: false,
      instagramPostId,
      instagramPostUrl: preservedPostUrl,
      outcome: "skipped",
      reason: "disabled",
      errorMessage: "Instagram execution is disabled (INSTAGRAM_ENABLED=false).",
      mediaType: "",
      mediaProductType: "",
    });
  }

  if (!input.instagramCredentials) {
    return buildInstagramEditOutcome({
      instagramUpdated: false,
      instagramPostId,
      instagramPostUrl: preservedPostUrl,
      outcome: "failed",
      reason: "credentials_missing",
      errorMessage: "Instagram credentials are missing.",
      mediaType: "",
      mediaProductType: "",
    });
  }

  const accessToken = input.instagramCredentials.publishAccessToken.trim();
  if (!accessToken) {
    return buildInstagramEditOutcome({
      instagramUpdated: false,
      instagramPostId,
      instagramPostUrl: preservedPostUrl,
      outcome: "failed",
      reason: "credentials_missing",
      errorMessage: "Instagram publish access token is missing.",
      mediaType: "",
      mediaProductType: "",
    });
  }

  const caption = buildInstagramCaption(input.payload, input.shopifyProductUrl);
  const graphBase = `https://graph.facebook.com/${INSTAGRAM_GRAPH_API_VERSION}`;
  const metadataFields = "id,caption,permalink,media_type,media_product_type,comment_enabled";
  const metadataUrl = `${graphBase}/${instagramPostId}?${new URLSearchParams({
    fields: metadataFields,
    access_token: accessToken,
  })}`;

  let mediaType = "";
  let mediaProductType = "";
  let instagramPostUrl = preservedPostUrl;
  let existingCommentEnabled: boolean | undefined;
  const requestPath = `/${instagramPostId}`;

  try {
    const metadataResponse = await fetch(metadataUrl);
    const metadataPayload = await readInstagramJsonResponse<InstagramEditMetadataResponse>(
      metadataResponse
    );
    const metadataHasGraphError = Boolean(
      metadataPayload && typeof metadataPayload === "object" && "error" in metadataPayload
    );

    if (metadataResponse.ok && !metadataHasGraphError && metadataPayload) {
      const resolvedTypes = resolveInstagramEditMediaType(metadataPayload);
      mediaType = resolvedTypes.mediaType;
      mediaProductType = resolvedTypes.mediaProductType;
      existingCommentEnabled =
        typeof metadataPayload.comment_enabled === "boolean"
          ? metadataPayload.comment_enabled
          : undefined;
      if (!instagramPostUrl) {
        instagramPostUrl = metadataPayload.permalink?.trim() ?? "";
      }
      console.info("[flowcart:instagram:update]", {
        stage: "metadata",
        instagramPostId,
        requestPath,
        mediaType,
        mediaProductType,
        hasCommentEnabled: typeof existingCommentEnabled === "boolean",
      });
      if (mediaType && !isPotentiallyEditableInstagramMediaType(mediaType)) {
        return buildInstagramEditOutcome({
          instagramUpdated: false,
          instagramPostId,
          instagramPostUrl,
          outcome: "unchanged",
          reason: "unsupported_media_type",
          errorMessage: "Published post can't be edited in place for this media type.",
          mediaType,
          mediaProductType,
        });
      }
    } else if (metadataPayload) {
      console.warn("[flowcart:instagram:update]", {
        stage: "metadata",
        outcome: "warning",
        instagramPostId,
        requestPath,
        message: "Metadata read failed; proceeding with same-id edit attempt.",
      });
      const metadataError = normalizeInstagramGraphError(
        metadataPayload,
        metadataResponse.status,
        "publish"
      );
      const unsupportedMetadata = isUnsupportedInstagramEditFailure({
        graphMessage: metadataError.graphMessage,
        code: metadataError.code,
      });
      if (unsupportedMetadata) {
        return buildInstagramEditOutcome({
          instagramUpdated: false,
          instagramPostId,
          instagramPostUrl,
          outcome: "unchanged",
          reason: "unsupported_edit_path",
          errorMessage: "Published post can't be edited in place for this media type.",
          mediaType,
          mediaProductType,
        });
      }
    }
    const executeEditAttempt = async (input: {
      attempt: "primary" | "retry-comment-enabled";
      commentEnabled?: boolean;
    }): Promise<{
      ok: boolean;
      normalizedError?: ReturnType<typeof normalizeInstagramGraphError>;
    }> => {
      const editParams = new URLSearchParams({
        caption,
        access_token: accessToken,
      });
      if (typeof input.commentEnabled === "boolean") {
        editParams.set("comment_enabled", input.commentEnabled ? "true" : "false");
      }

      const response = await fetch(`${graphBase}/${instagramPostId}`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: editParams.toString(),
      });
      const payload = await readInstagramJsonResponse<{ error?: unknown }>(response);
      const hasGraphError = Boolean(payload && typeof payload === "object" && "error" in payload);

      if (response.ok && !hasGraphError) {
        console.info("[flowcart:instagram:update]", {
          stage: "edit",
          attempt: input.attempt,
          outcome: "success",
          instagramPostId,
          requestPath,
          mediaType,
          mediaProductType,
          usedCommentEnabled: typeof input.commentEnabled === "boolean",
          commentEnabledValue: input.commentEnabled ?? null,
        });
        return { ok: true };
      }

      const normalizedError = normalizeInstagramGraphError(payload, response.status, "publish");
      console.warn("[flowcart:instagram:update]", {
        stage: "edit",
        attempt: input.attempt,
        outcome: "failure",
        instagramPostId,
        requestPath,
        mediaType,
        mediaProductType,
        usedCommentEnabled: typeof input.commentEnabled === "boolean",
        commentEnabledValue: input.commentEnabled ?? null,
        status: normalizedError.status,
        code: normalizedError.code,
        subcode: normalizedError.subcode,
        graphMessage: normalizedError.graphMessage,
      });
      return { ok: false, normalizedError };
    };

    let editAttempt = await executeEditAttempt({
      attempt: "primary",
      commentEnabled: existingCommentEnabled,
    });

    if (!editAttempt.ok && editAttempt.normalizedError) {
      if (
        isCommentEnabledRequiredFailure({
          graphMessage: editAttempt.normalizedError.graphMessage,
          code: editAttempt.normalizedError.code,
        })
      ) {
        const retryCommentEnabled =
          typeof existingCommentEnabled === "boolean" ? existingCommentEnabled : true;
        editAttempt = await executeEditAttempt({
          attempt: "retry-comment-enabled",
          commentEnabled: retryCommentEnabled,
        });
      }
    }

    if (!editAttempt.ok && editAttempt.normalizedError) {
      const unsupported = isUnsupportedInstagramEditFailure({
        graphMessage: editAttempt.normalizedError.graphMessage,
        code: editAttempt.normalizedError.code,
      });
      if (unsupported) {
        return buildInstagramEditOutcome({
          instagramUpdated: false,
          instagramPostId,
          instagramPostUrl,
          outcome: "unchanged",
          reason: "unsupported_edit_path",
          errorMessage: "Published post can't be edited in place for this media type.",
          mediaType,
          mediaProductType,
        });
      }

      return buildInstagramEditOutcome({
        instagramUpdated: false,
        instagramPostId,
        instagramPostUrl,
        outcome: "failed",
        reason: "unexpected_error",
        errorMessage: editAttempt.normalizedError.message,
        mediaType,
        mediaProductType,
      });
    }

    const verificationResponse = await fetch(
      `${graphBase}/${instagramPostId}?${new URLSearchParams({
        fields: "caption,permalink",
        access_token: accessToken,
      })}`
    );
    const verificationPayload = await readInstagramJsonResponse<InstagramEditMetadataResponse>(
      verificationResponse
    );
    const verificationHasGraphError = Boolean(
      verificationPayload &&
        typeof verificationPayload === "object" &&
        "error" in verificationPayload
    );

    if (verificationResponse.ok && !verificationHasGraphError && verificationPayload) {
      const verifiedCaption = normalizeCaptionForComparison(
        String(verificationPayload.caption ?? "")
      );
      const expectedCaption = normalizeCaptionForComparison(caption);
      const verifiedUrl = verificationPayload.permalink?.trim() ?? instagramPostUrl;
      const captionMatched = verifiedCaption === expectedCaption;

      console.info("[flowcart:instagram:update]", {
        stage: "verification",
        instagramPostId,
        requestPath,
        mediaType,
        mediaProductType,
        captionMatched,
      });

      if (captionMatched) {
        console.info("[flowcart:instagram:update]", {
          outcome: "updated",
          instagramPostId,
          mediaType,
          mediaProductType,
        });
        return buildInstagramEditOutcome({
          instagramUpdated: true,
          instagramPostId,
          instagramPostUrl: verifiedUrl,
          outcome: "updated",
          reason: "updated_in_place",
          errorMessage: "",
          mediaType,
          mediaProductType,
        });
      }

      return buildInstagramEditOutcome({
        instagramUpdated: false,
        instagramPostId,
        instagramPostUrl: verifiedUrl,
        outcome: "unchanged",
        reason: "unsupported_edit_path",
        errorMessage: "Published post can't be edited in place for this media type.",
        mediaType,
        mediaProductType,
      });
    }

    return buildInstagramEditOutcome({
      instagramUpdated: false,
      instagramPostId,
      instagramPostUrl,
      outcome: "unchanged",
      reason: "unsupported_edit_path",
      errorMessage: "Published post couldn't be confirmed as updated and was left unchanged.",
      mediaType,
      mediaProductType,
    });
  } catch (error) {
    return buildInstagramEditOutcome({
      instagramUpdated: false,
      instagramPostId,
      instagramPostUrl,
      outcome: "failed",
      reason: "unexpected_error",
      errorMessage: error instanceof Error ? error.message : "Instagram update failed.",
      mediaType,
      mediaProductType,
    });
  }
}
