import { extractUserId } from "@/src/lib/server/auth";
import { createBucket } from "@/src/lib/server/buckets";
import { errorResponse, okResponse } from "@/src/lib/server/api-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const userId = await extractUserId(request);
    if (!userId) {
      return errorResponse("Not authenticated.", { status: 401 });
    }

    const bucket = await createBucket(userId);
    return okResponse({ bucket }, 201);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to create bucket.";
    return errorResponse(message, { status: 500 });
  }
}
