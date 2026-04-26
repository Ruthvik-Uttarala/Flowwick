import { z } from "zod";
import { supabasePublicEnv } from "@/src/lib/supabase/env";
import { errorResponse, okResponse } from "@/src/lib/server/api-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const resetSchema = z.object({
  email: z.string().trim().email().transform((value) => value.toLowerCase()),
});

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const parsed = resetSchema.safeParse(body);

    if (!parsed.success) {
      return errorResponse("Enter a valid email address.", { status: 400 });
    }

    const genericMessage = "If this email has an account, reset instructions were sent.";

    if (!supabasePublicEnv.url || !supabasePublicEnv.anonKey) {
      return okResponse({ message: genericMessage });
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
      return okResponse({ message: genericMessage });
    }

    return okResponse({
      message: genericMessage,
    });
  } catch (error) {
    console.error("[merchflow:auth:reset]", error);
    return okResponse({
      message: "If this email has an account, reset instructions were sent.",
    });
  }
}
