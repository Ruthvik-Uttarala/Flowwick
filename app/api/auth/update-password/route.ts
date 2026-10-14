import { z } from "zod";
import { errorResponse, okResponse } from "@/src/lib/server/api-response";
import {
  buildClearCookieOptions,
  supabaseAuthConfigured,
  updatePasswordWithRecovery,
} from "@/src/lib/supabase/server";
import {
  SUPABASE_ACCESS_COOKIE,
  SUPABASE_REFRESH_COOKIE,
} from "@/src/lib/supabase/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const updatePasswordSchema = z
  .object({
    password: z.string().min(8).max(256),
    accessToken: z.string().trim().min(1).max(8192).optional(),
    tokenHash: z.string().trim().min(1).max(2048).optional(),
  })
  .refine((value) => Boolean(value.accessToken || value.tokenHash), {
    message: "Recovery credential required.",
  });

function clearSessionCookies(response: ReturnType<typeof okResponse>) {
  const options = buildClearCookieOptions();
  response.cookies.set(SUPABASE_ACCESS_COOKIE, "", options);
  response.cookies.set(SUPABASE_REFRESH_COOKIE, "", options);
  return response;
}

export async function POST(request: Request) {
  if (!supabaseAuthConfigured) {
    return errorResponse("Password recovery is temporarily unavailable.", { status: 503 });
  }

  const body = await request.json().catch(() => null);
  const parsed = updatePasswordSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("Use a password with at least 8 characters and a valid recovery link.", {
      status: 400,
      data: { code: "invalid_request" },
    });
  }

  const result = await updatePasswordWithRecovery(parsed.data).catch(() => null);
  if (!result) {
    return errorResponse("Password recovery is temporarily unavailable.", { status: 503 });
  }
  if (!result.updated) {
    const invalidLink = result.errorCode === "invalid_recovery_link";
    return errorResponse(
      invalidLink
        ? "This password reset link is invalid, expired, or has already been used."
        : "This password does not meet the account security requirements.",
      {
        status: invalidLink ? 401 : 400,
        data: { code: result.errorCode },
      },
    );
  }

  return clearSessionCookies(
    okResponse({ message: "Password updated successfully" }),
  );
}
