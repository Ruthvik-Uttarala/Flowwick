import { z } from "zod";
import {
  serializeSessionCookies,
  signInWithSupabase,
  supabaseAuthConfigured,
} from "@/src/lib/supabase/server";
import { errorResponse, okResponse } from "@/src/lib/server/api-response";

const loginSchema = z.object({
  email: z.string().trim().email().transform((value) => value.toLowerCase()),
  password: z.string().min(1),
});

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    if (!supabaseAuthConfigured) {
      console.error("[merchflow:auth:login] Supabase auth is not configured");
      return errorResponse(
        "Supabase auth is not configured. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.",
        { status: 503 }
      );
    }

    const body = await request.json().catch(() => null);
    const parsed = loginSchema.safeParse(body);

    if (!parsed.success) {
      console.warn("[merchflow:auth:login] Validation failed:", parsed.error.issues);
      return errorResponse("Enter a valid email and password.", { status: 400 });
    }

    console.log("[merchflow:auth:login] Attempting login for:", parsed.data.email);

    const result = await signInWithSupabase(parsed.data);

    console.log("[merchflow:auth:login] Login result:", {
      hasSession: !!result.session,
      hasError: !!result.error,
      error: result.error ?? null,
    });

    if (!result.session) {
      console.error("[merchflow:auth:login] Login failed:", result.error);
      return errorResponse(
        "Invalid email or password. Use Reset if this email already has an account.",
        { status: 401 }
      );
    }

    console.log("[merchflow:auth:login] Session created for user:", result.session.user?.email, "id:", result.session.user?.id);

    const response = okResponse({
      user: result.session.user,
      email: result.session.user.email ?? parsed.data.email,
    });

    for (const cookie of serializeSessionCookies(result.session)) {
      response.cookies.set(cookie.name, cookie.value, cookie.options);
    }

    return response;
  } catch (error) {
    console.error("[merchflow:auth:login] Unhandled error:", error);
    return errorResponse("Login failed due to an unexpected error.", { status: 500 });
  }
}
