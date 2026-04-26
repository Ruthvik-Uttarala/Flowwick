import { z } from "zod";
import {
  serializeSessionCookies,
  signUpWithSupabase,
  supabaseAuthConfigured,
} from "@/src/lib/supabase/server";
import { errorResponse, okResponse } from "@/src/lib/server/api-response";

const signupSchema = z.object({
  email: z.string().trim().email().transform((value) => value.toLowerCase()),
  password: z.string().min(8),
});

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    if (!supabaseAuthConfigured) {
      console.error("[merchflow:auth:signup] Supabase auth is not configured");
      return errorResponse(
        "Supabase auth is not configured. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.",
        { status: 503 }
      );
    }

    const body = await request.json().catch(() => null);
    const parsed = signupSchema.safeParse(body);

    if (!parsed.success) {
      console.warn("[merchflow:auth:signup] Validation failed:", parsed.error.issues);
      return errorResponse(
        "Use a valid email and a password with at least 8 characters.",
        { status: 400 }
      );
    }

    console.log("[merchflow:auth:signup] Attempting signup for:", parsed.data.email);

    const result = await signUpWithSupabase(parsed.data);

    console.log("[merchflow:auth:signup] Signup result:", {
      hasSession: !!result.session,
      hasError: !!result.error,
      error: result.error ?? null,
    });

    if (result.error) {
      console.error("[merchflow:auth:signup] Signup error:", result.error);
      return errorResponse(
        "This email may already have an account. Try logging in or reset your password.",
        { status: 400 }
      );
    }

    const response = okResponse({
      needsConfirmation: !result.session,
      message: result.session
        ? "Account created and signed in."
        : "Account created. Check your email to confirm the account, then sign in.",
    });

    if (result.session) {
      console.log("[merchflow:auth:signup] Session created, setting cookies for:", result.session.user?.email);
      for (const cookie of serializeSessionCookies(result.session)) {
        response.cookies.set(cookie.name, cookie.value, cookie.options);
      }
    } else {
      console.log("[merchflow:auth:signup] No session — email confirmation required");
    }

    return response;
  } catch (error) {
    console.error("[merchflow:auth:signup] Unhandled error:", error);
    return errorResponse("Signup failed due to an unexpected error.", { status: 500 });
  }
}
