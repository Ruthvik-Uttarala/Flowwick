type GraphErrorPayload = {
  error?: {
    message?: string;
    code?: number;
    error_subcode?: number;
    type?: string;
  };
};

type InstagramMetadata = {
  id?: string;
  caption?: string;
  permalink?: string;
  media_type?: string;
  media_product_type?: string;
  comment_enabled?: boolean;
  error?: GraphErrorPayload["error"];
};

interface CliInput {
  token: string;
  instagramPostId: string;
  newCaption: string;
  businessAccountId: string;
  instagramPostUrl: string;
}

const GRAPH_VERSION = process.env.INSTAGRAM_GRAPH_API_VERSION ?? "v23.0";

function parseCliInput(): CliInput {
  const [, , tokenArg, postIdArg, captionArg, businessAccountIdArg, postUrlArg] = process.argv;

  const token = tokenArg?.trim() ?? "";
  const instagramPostId = postIdArg?.trim() ?? "";
  const newCaption = captionArg ?? "";
  const businessAccountId = businessAccountIdArg?.trim() ?? "";
  const instagramPostUrl = postUrlArg?.trim() ?? "";

  if (!token || !instagramPostId || !newCaption) {
    console.error(
      [
        "Usage:",
        "  node --loader ts-node/esm scripts/debug-instagram-edit.ts <token> <instagramPostId> <newCaption> [businessAccountId] [instagramPostUrl]",
        "",
        "Example:",
        '  node --loader ts-node/esm scripts/debug-instagram-edit.ts "<token>" "17900000000000000" "Updated caption" "17840000000000000" "https://www.instagram.com/p/ABC123/"',
      ].join("\n")
    );
    process.exit(1);
  }

  return { token, instagramPostId, newCaption, businessAccountId, instagramPostUrl };
}

function normalizePermalink(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }
  try {
    const parsed = new URL(trimmed);
    parsed.search = "";
    parsed.hash = "";
    return `${parsed.origin.toLowerCase()}${parsed.pathname.replace(/\/+$/, "").toLowerCase()}`;
  } catch {
    return trimmed.replace(/[?#].*$/, "").replace(/\/+$/, "").toLowerCase();
  }
}

async function readJson<T>(response: Response): Promise<T | null> {
  try {
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

function printGraphError(payload: GraphErrorPayload | InstagramMetadata | null): void {
  const error = payload && typeof payload === "object" && "error" in payload ? payload.error : null;
  if (!error) {
    return;
  }
  console.error("Graph error:", {
    message: error.message ?? "",
    code: error.code ?? null,
    subcode: error.error_subcode ?? null,
    type: error.type ?? "",
  });
}

function isCommentEnabledRequired(payload: GraphErrorPayload | null): boolean {
  const message = payload?.error?.message?.toLowerCase() ?? "";
  const code = payload?.error?.code ?? null;
  return (
    code === 100 &&
    (message.includes("parameter comment_enabled is required") ||
      message.includes("the parameter comment_enabled is required"))
  );
}

async function main() {
  const input = parseCliInput();
  const graphBase = `https://graph.facebook.com/${GRAPH_VERSION}`;
  const metadataFields = "id,caption,permalink,media_type,media_product_type,comment_enabled";

  let targetPostId = input.instagramPostId;
  let requestPath = `/${targetPostId}`;

  const readMetadata = async (postId: string) => {
    const metadataResponse = await fetch(
      `${graphBase}/${postId}?${new URLSearchParams({
        fields: metadataFields,
        access_token: input.token,
      })}`
    );
    const metadata = await readJson<InstagramMetadata>(metadataResponse);
    const hasGraphError = Boolean(metadata && typeof metadata === "object" && "error" in metadata);
    return { metadataResponse, metadata, hasGraphError };
  };

  let metadataResult = await readMetadata(targetPostId);

  if (
    (!metadataResult.metadataResponse.ok || metadataResult.hasGraphError) &&
    input.businessAccountId &&
    input.instagramPostUrl
  ) {
    const mediaListResponse = await fetch(
      `${graphBase}/${input.businessAccountId}/media?${new URLSearchParams({
        fields: metadataFields,
        limit: "50",
        access_token: input.token,
      })}`
    );
    const mediaList = await readJson<{ data?: InstagramMetadata[]; error?: unknown }>(mediaListResponse);
    if (mediaListResponse.ok && mediaList && !("error" in mediaList)) {
      const targetPermalink = normalizePermalink(input.instagramPostUrl);
      const match = (mediaList.data ?? []).find(
        (item) => normalizePermalink(String(item.permalink ?? "")) === targetPermalink
      );
      const resolvedId = match?.id?.trim() ?? "";
      if (resolvedId && resolvedId !== targetPostId) {
        targetPostId = resolvedId;
        requestPath = `/${targetPostId}`;
        metadataResult = await readMetadata(targetPostId);
        console.log("Resolved target post id by permalink:", {
          savedInstagramPostId: input.instagramPostId,
          targetPostId,
        });
      }
    }
  }

  console.log("Metadata stage:", {
    requestPath,
    savedInstagramPostId: input.instagramPostId,
    targetPostId,
    ok: metadataResult.metadataResponse.ok,
    metadata: metadataResult.metadata,
  });
  if (!metadataResult.metadataResponse.ok || metadataResult.hasGraphError) {
    printGraphError(metadataResult.metadata);
  }

  const metadataCommentEnabled =
    typeof metadataResult.metadata?.comment_enabled === "boolean"
      ? metadataResult.metadata.comment_enabled
      : undefined;

  const executeEdit = async (attempt: "primary" | "retry-comment-enabled", commentEnabled?: boolean) => {
    const body = new URLSearchParams({
      caption: input.newCaption,
      access_token: input.token,
    });
    if (typeof commentEnabled === "boolean") {
      body.set("comment_enabled", commentEnabled ? "true" : "false");
    }

    const editResponse = await fetch(`${graphBase}/${targetPostId}`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
    const editPayload = await readJson<GraphErrorPayload>(editResponse);
    const hasGraphError = Boolean(
      editPayload && typeof editPayload === "object" && "error" in editPayload
    );

    console.log("Edit stage:", {
      attempt,
      requestPath,
      status: editResponse.status,
      ok: editResponse.ok && !hasGraphError,
      usedCommentEnabled: typeof commentEnabled === "boolean",
      commentEnabledValue: commentEnabled ?? null,
      payload: editPayload,
    });
    if (!editResponse.ok || hasGraphError) {
      printGraphError(editPayload);
      return { ok: false, payload: editPayload };
    }
    return { ok: true, payload: editPayload };
  };

  let editResult = await executeEdit("primary", metadataCommentEnabled);
  if (!editResult.ok && isCommentEnabledRequired(editResult.payload ?? null)) {
    editResult = await executeEdit(
      "retry-comment-enabled",
      typeof metadataCommentEnabled === "boolean" ? metadataCommentEnabled : true
    );
  }

  const verificationResponse = await fetch(
    `${graphBase}/${targetPostId}?${new URLSearchParams({
      fields: "caption,permalink",
      access_token: input.token,
    })}`
  );
  const verificationPayload = await readJson<InstagramMetadata>(verificationResponse);
  const verificationHasError = Boolean(
    verificationPayload && typeof verificationPayload === "object" && "error" in verificationPayload
  );

  console.log("Verification stage:", {
    requestPath,
    status: verificationResponse.status,
    ok: verificationResponse.ok && !verificationHasError,
    expectedCaption: input.newCaption,
    readbackCaption: verificationPayload?.caption ?? "",
    captionMatched: (verificationPayload?.caption ?? "") === input.newCaption,
    permalink: verificationPayload?.permalink ?? "",
  });
  if (!verificationResponse.ok || verificationHasError) {
    printGraphError(verificationPayload);
  }
}

void main();
