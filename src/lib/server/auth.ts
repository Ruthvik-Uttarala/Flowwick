import {
  SUPABASE_ACCESS_COOKIE,
  SUPABASE_REFRESH_COOKIE,
} from "@/src/lib/supabase/types";
import {
  getSupabaseUser,
  refreshSupabaseSession,
  supabaseAuthConfigured,
} from "@/src/lib/supabase/server";

export async function extractUserId(request: Request): Promise<string | null> {
  if (!supabaseAuthConfigured) return null;

  const cookieHeader = request.headers.get("cookie") ?? "";

  const accessToken = cookieHeader.match(
    new RegExp(`${SUPABASE_ACCESS_COOKIE}=([^;]+)`)
  )?.[1];

  if (accessToken) {
    const result = await getSupabaseUser(decodeURIComponent(accessToken));
    if (result.user?.id) return result.user.id;
  }

  const refreshToken = cookieHeader.match(
    new RegExp(`${SUPABASE_REFRESH_COOKIE}=([^;]+)`)
  )?.[1];

  if (refreshToken) {
    const result = await refreshSupabaseSession(
      decodeURIComponent(refreshToken)
    );
    if (result.session?.user?.id) return result.session.user.id;
  }

  return null;
}
