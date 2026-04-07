import { NextResponse } from "next/server";
import { extractUserId } from "@/src/lib/server/auth";
import { errorResponse } from "@/src/lib/server/api-response";
import {
  INSTAGRAM_OAUTH_STATE_COOKIE,
  INSTAGRAM_OAUTH_STATE_TTL_SECONDS,
  buildInstagramAuthorizeUrl,
  buildInstagramSettingsUrl,
  generateInstagramOauthState,
  getMetaCallbackHost,
  isMetaCallbackRequestAuthoritative,
} from "@/src/lib/server/instagram";
import {
  InstagramOauthStatePersistenceError,
  saveInstagramOauthState,
} from "@/src/lib/server/instagram-oauth-state";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function withOauthStateCookie(response: NextResponse, state: string): NextResponse {
  response.cookies.set(INSTAGRAM_OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: INSTAGRAM_OAUTH_STATE_TTL_SECONDS,
  });
  return response;
}

export async function GET(request: Request) {
  try {
    const userId = await extractUserId(request);
    if (!userId) {
      return errorResponse("Not authenticated.", { status: 401 });
    }

    if (!isMetaCallbackRequestAuthoritative(request)) {
      console.info("[flowcart:instagram:connect]", {
        stage: "app_url_mismatch",
        host: getMetaCallbackHost(request),
      });
      return NextResponse.redirect(
        new URL(buildInstagramSettingsUrl({ errorCode: "app_url_mismatch" }))
      );
    }

    const state = generateInstagramOauthState();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + INSTAGRAM_OAUTH_STATE_TTL_SECONDS * 1000);
    await saveInstagramOauthState({
      state,
      userId,
      createdAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
    });

    console.info("[flowcart:instagram:connect]", {
      stage: "redirect_to_meta",
      host: getMetaCallbackHost(request),
      statePrefix: state.slice(0, 8),
    });

    return withOauthStateCookie(NextResponse.redirect(buildInstagramAuthorizeUrl(state)), state);
  } catch (error) {
    if (error instanceof InstagramOauthStatePersistenceError) {
      return errorResponse(error.message, {
        status: 500,
        data: { code: "oauth_state_persist_failed" },
      });
    }

    const message =
      error instanceof Error ? error.message : "Failed to initiate Instagram connection.";
    console.error("[flowcart:instagram:connect]", message);
    return errorResponse(message, { status: 500 });
  }
}
