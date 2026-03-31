import { z } from "zod";
import { supabasePublicEnv } from "@/src/lib/supabase/env";
import { errorResponse, okResponse } from "@/src/lib/server/api-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const resetSchema = z.object({
  email: z.string().email().trim(),
});

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const parsed = resetSchema.safeParse(body);

    if (!parsed.success) {
      return errorResponse("Enter a valid email address.", { status: 400 });
    }

    const url = `${supabasePublicEnv.url.replace(/\/$/, "")}/auth/v1/recover`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        apikey: supabasePublicEnv.anonKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email: parsed.data.email }),
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      const message =
        (payload as { message?: string })?.message ?? "Password reset request failed.";
      return errorResponse(message, { status: response.status });
    }

    return okResponse({
      message: "If that email exists, a password reset link has been sent.",
    });
  } catch (error) {
    console.error("[merchflow:auth:reset]", error);
    return errorResponse("Password reset failed.", { status: 500 });
  }
}
