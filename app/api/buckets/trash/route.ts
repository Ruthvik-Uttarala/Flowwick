import { extractUserId } from "@/src/lib/server/auth";
import { getTrashedBuckets } from "@/src/lib/server/buckets";
import { errorResponse, okResponse } from "@/src/lib/server/api-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const userId = await extractUserId(request);
    if (!userId) {
      return errorResponse("Not authenticated.", { status: 401 });
    }

    const trashedBuckets = await getTrashedBuckets(userId);
    return okResponse({ trashedBuckets });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load trashed buckets.";
    return errorResponse(message, { status: 500 });
  }
}
