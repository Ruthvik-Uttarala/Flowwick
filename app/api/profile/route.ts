import { z, ZodError } from "zod";
import { extractUserId } from "@/src/lib/server/auth";
import { errorResponse, okResponse } from "@/src/lib/server/api-response";
import { getOrCreateProfile, saveProfile } from "@/src/lib/server/profiles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const profilePatchSchema = z
  .object({
    displayName: z.string().trim().max(80).optional(),
    shopName: z.string().trim().max(80).optional(),
    bio: z.string().trim().max(240).optional(),
  })
  .strict();

export async function GET(request: Request) {
  try {
    const userId = await extractUserId(request);
    if (!userId) {
      return errorResponse("Not authenticated.", { status: 401 });
    }

    const profile = await getOrCreateProfile(userId);
    return okResponse({ profile });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load profile.";
    return errorResponse(message, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const userId = await extractUserId(request);
    if (!userId) {
      return errorResponse("Not authenticated.", { status: 401 });
    }

    const body = await request.json();
    const parsed = profilePatchSchema.parse(body);

    const profile = await saveProfile(userId, {
      displayName: parsed.displayName,
      shopName: parsed.shopName,
      bio: parsed.bio,
    });

    return okResponse({ profile });
  } catch (error) {
    if (error instanceof ZodError) {
      return errorResponse(error.issues[0]?.message ?? "Invalid profile payload.", {
        status: 400,
      });
    }

    const message = error instanceof Error ? error.message : "Failed to save profile.";
    return errorResponse(message, { status: 500 });
  }
}
