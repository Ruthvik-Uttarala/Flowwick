import { NextResponse } from "next/server";
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

function redirectToSettings(input?: {
  errorCode?: string;
  connected?: boolean;
  selectionRequired?: boolean;
}) {
  const targetUrl = input?.errorCode
    ? buildInstagramSettingsUrl({ errorCode: input.errorCode as never })
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

  if (!code || !state) {
    return redirectToSettings({ errorCode: "missing_params" });
  }

  const stateCookie = getMetaCallbackStateCookie(request);
  if (stateCookie && stateCookie !== state) {
    return redirectToSettings({ errorCode: "invalid_state" });
  }

  const storedState = await getInstagramOauthState(state);
  if (!storedState) {
    return redirectToSettings({ errorCode: "invalid_state" });
  }

  const finalizeFailure = async (errorCode: string, reason: string) => {
    console.warn("[flowcart:instagram:callback]", {
      stage: "failure",
      reason,
      statePrefix: state.slice(0, 8),
    });

    try {
      await deleteInstagramOauthState(state);
    } catch {
      // Ignore cleanup failures.
    }

    return redirectToSettings({ errorCode });
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

    const completed = await completeInstagramOauthConnection({
      userId: storedState.user_id,
      longLivedUserToken: exchanged.longLivedUserToken,
      tokenExpiresAt,
    });

    await deleteInstagramOauthState(state);

    console.info("[flowcart:instagram:callback]", {
      stage: "completed",
      statePrefix: state.slice(0, 8),
      selectionRequired: completed.selectionRequired,
      status: completed.connection.status,
      pageId: completed.connection.selectedPageId,
      instagramBusinessAccountId:
        completed.connection.selectedInstagramBusinessAccountId,
      hasLongLivedUserToken: completed.connection.hasLongLivedUserToken,
      hasPublishCredential: completed.connection.hasPublishCredential,
    });

    if (completed.selectionRequired) {
      return redirectToSettings({ selectionRequired: true });
    }

    if (completed.connection.status !== "connected") {
      return redirectToSettings({ errorCode: "no_eligible_account" });
    }

    return redirectToSettings({ connected: true });
  } catch (error) {
    return finalizeFailure(
      error instanceof Error && error.message.includes("discover")
        ? "account_discovery_failed"
        : "token_exchange_failed",
      error instanceof Error ? error.message : "unexpected_callback_error"
    );
  }
}
