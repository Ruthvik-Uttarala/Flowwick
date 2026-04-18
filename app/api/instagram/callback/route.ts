import { NextResponse } from "next/server";
import type { InstagramCallbackErrorCode } from "@/src/lib/instagram";
import {
  completeInstagramOauthConnection,
} from "@/src/lib/server/instagram-credentials";
import {
  INSTAGRAM_OAUTH_STATE_COOKIE,
  buildInstagramSettingsUrl,
  exchangeInstagramCodeForLongLivedUserToken,
  getMetaCallbackStateCookie,
} from "@/src/lib/server/instagram";
import {
  deleteInstagramOauthState,
  getInstagramOauthState,
} from "@/src/lib/server/instagram-oauth-state";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getUserIdPrefix(userId?: string): string {
  return userId?.trim().slice(0, 8) ?? "";
}

function redirectToSettings(input?: {
  errorCode?: InstagramCallbackErrorCode;
  connected?: boolean;
  selectionRequired?: boolean;
  statePrefix?: string;
  userIdPrefix?: string;
  finalStatus?: string;
  finalErrorCode?: string;
  selectedPageId?: string;
  selectedInstagramBusinessAccountId?: string;
}) {
  console.info("[flowcart:instagram:callback]", {
    stage: "redirect_decision",
    statePrefix: input?.statePrefix ?? "",
    userIdPrefix: input?.userIdPrefix ?? "",
    finalStatus: input?.finalStatus ?? "",
    finalErrorCode: input?.finalErrorCode ?? input?.errorCode ?? "",
    selectionRequired: Boolean(input?.selectionRequired),
    selectedPageId: input?.selectedPageId ?? "",
    selectedInstagramBusinessAccountId:
      input?.selectedInstagramBusinessAccountId ?? "",
    connected: Boolean(input?.connected),
  });

  const targetUrl = input?.errorCode
    ? buildInstagramSettingsUrl({ errorCode: input.errorCode })
    : buildInstagramSettingsUrl({
        connected: input?.connected,
        selectionRequired: input?.selectionRequired,
      });

  const response = NextResponse.redirect(new URL(targetUrl));
  response.cookies.set(INSTAGRAM_OAUTH_STATE_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
  return response;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code")?.trim() ?? "";
  const state = url.searchParams.get("state")?.trim() ?? "";
  const statePrefix = state.slice(0, 8);

  if (!code || !state) {
    return redirectToSettings({
      errorCode: "missing_params",
      statePrefix,
      finalErrorCode: "missing_params",
    });
  }

  const stateCookie = getMetaCallbackStateCookie(request);
  if (stateCookie && stateCookie !== state) {
    return redirectToSettings({
      errorCode: "invalid_state",
      statePrefix,
      finalErrorCode: "invalid_state",
    });
  }

  const storedState = await getInstagramOauthState(state);
  if (!storedState) {
    return redirectToSettings({
      errorCode: "invalid_state",
      statePrefix,
      finalErrorCode: "invalid_state",
    });
  }

  const userIdPrefix = getUserIdPrefix(storedState.user_id);
  const finalizeFailure = async (
    errorCode: InstagramCallbackErrorCode,
    reason: string
  ) => {
    console.warn("[flowcart:instagram:callback]", {
      stage: "failure",
      reason,
      statePrefix,
      userIdPrefix,
    });

    try {
      await deleteInstagramOauthState(state);
    } catch {
      // Ignore cleanup failures.
    }

    return redirectToSettings({
      errorCode,
      statePrefix,
      userIdPrefix,
      finalErrorCode: errorCode,
    });
  };

  if (new Date(storedState.expires_at).getTime() <= Date.now()) {
    return finalizeFailure("expired_state", "expired_oauth_state");
  }

  try {
    const exchanged = await exchangeInstagramCodeForLongLivedUserToken(code);
    const tokenExpiresAt =
      exchanged.expiresIn > 0
        ? new Date(Date.now() + exchanged.expiresIn * 1000).toISOString()
        : "";

    console.info("[flowcart:instagram:callback]", {
      stage: "token_exchange_succeeded",
      statePrefix,
      userIdPrefix,
      hasShortLivedUserToken: Boolean(exchanged.shortLivedUserToken),
      hasLongLivedUserToken: Boolean(exchanged.longLivedUserToken),
      hasTokenExpiry: Boolean(tokenExpiresAt),
    });

    const completed = await completeInstagramOauthConnection({
      userId: storedState.user_id,
      longLivedUserToken: exchanged.longLivedUserToken,
      tokenExpiresAt,
      statePrefix,
    });

    await deleteInstagramOauthState(state);

    console.info("[flowcart:instagram:callback]", {
      stage: "completed",
      statePrefix,
      userIdPrefix,
      selectionRequired: completed.selectionRequired,
      status: completed.connection.status,
      pageId: completed.connection.selectedPageId,
      instagramBusinessAccountId:
        completed.connection.selectedInstagramBusinessAccountId,
      hasLongLivedUserToken: completed.connection.hasLongLivedUserToken,
      hasPublishCredential: completed.connection.hasPublishCredential,
    });

    if (completed.selectionRequired) {
      return redirectToSettings({
        selectionRequired: true,
        statePrefix,
        userIdPrefix,
        finalStatus: completed.connection.status,
        finalErrorCode: completed.connection.errorCode,
        selectedPageId: completed.connection.selectedPageId,
        selectedInstagramBusinessAccountId:
          completed.connection.selectedInstagramBusinessAccountId,
      });
    }

    if (completed.connection.status !== "connected") {
      console.error("[flowcart:instagram:callback]", {
        stage: "callback_blocker",
        statePrefix,
        userIdPrefix,
        finalStatus: completed.connection.status,
        finalErrorCode: completed.connection.errorCode,
        selectedPageId: completed.connection.selectedPageId,
        selectedInstagramBusinessAccountId:
          completed.connection.selectedInstagramBusinessAccountId,
        pageCount: completed.discovery.pageCount,
        pagesWithAccessToken: completed.discovery.pagesWithAccessToken,
        pageIds: completed.discovery.pageIds,
        candidateCount: completed.discovery.candidateCount,
      });

      const resolverErrorCode = completed.connection.errorCode.trim();
      const errorCode: InstagramCallbackErrorCode = resolverErrorCode
        ? (resolverErrorCode as InstagramCallbackErrorCode)
        : "no_eligible_account";
      return redirectToSettings({
        errorCode,
        statePrefix,
        userIdPrefix,
        finalStatus: completed.connection.status,
        finalErrorCode: errorCode,
        selectedPageId: completed.connection.selectedPageId,
        selectedInstagramBusinessAccountId:
          completed.connection.selectedInstagramBusinessAccountId,
      });
    }

    return redirectToSettings({
      connected: true,
      statePrefix,
      userIdPrefix,
      finalStatus: completed.connection.status,
      finalErrorCode: completed.connection.errorCode,
      selectedPageId: completed.connection.selectedPageId,
      selectedInstagramBusinessAccountId:
        completed.connection.selectedInstagramBusinessAccountId,
    });
  } catch (error) {
    return finalizeFailure(
      error instanceof Error && error.message.includes("discover")
        ? "account_discovery_failed"
        : "token_exchange_failed",
      error instanceof Error ? error.message : "unexpected_callback_error"
    );
  }
}
