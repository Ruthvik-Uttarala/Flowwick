import {
  SUPABASE_ACCESS_COOKIE,
  SUPABASE_REFRESH_COOKIE,
} from "@/src/lib/supabase/types";
import {
  getSupabaseUser,
  refreshSupabaseSession,
  serializeSessionCookies,
  supabaseAuthConfigured,
} from "@/src/lib/supabase/server";
import { okResponse } from "@/src/lib/server/api-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    if (!supabaseAuthConfigured) {
      return okResponse({ authenticated: false, configured: false });
    }

    const cookieHeader = request.headers.get("cookie") ?? "";
    const accessToken = cookieHeader.match(
      new RegExp(`${SUPABASE_ACCESS_COOKIE}=([^;]+)`),
    )?.[1];
    const refreshToken = cookieHeader.match(
      new RegExp(`${SUPABASE_REFRESH_COOKIE}=([^;]+)`),
    )?.[1];

    if (accessToken) {
      const userResult = await getSupabaseUser(decodeURIComponent(accessToken));
      if (userResult.user) {
        return okResponse({
          authenticated: true,
          user: userResult.user,
          configured: true,
        });
      }
    }

    if (refreshToken) {
      const refreshResult = await refreshSupabaseSession(decodeURIComponent(refreshToken));
      if (refreshResult.session) {
        const response = okResponse({
          authenticated: true,
          user: refreshResult.session.user,
          configured: true,
        });
        for (const cookie of serializeSessionCookies(refreshResult.session)) {
          response.cookies.set(cookie.name, cookie.value, cookie.options);
        }
        return response;
      }
    }

    return okResponse({ authenticated: false, configured: true });
  } catch (error) {
    console.error("[merchflow:auth:session]", error);
    return Response.json(
      { ok: false, error: { message: "Session check failed." } },
      { status: 500 }
    );
  }
}
