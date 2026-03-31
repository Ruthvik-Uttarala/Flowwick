import { extractUserId } from "@/src/lib/server/auth";
import { getBuckets } from "@/src/lib/server/buckets";
import { errorResponse, okResponse } from "@/src/lib/server/api-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const userId = await extractUserId(request);
    if (!userId) {
      return errorResponse("Not authenticated.", { status: 401 });
    }

    const buckets = await getBuckets(userId);
    return okResponse({ buckets });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load buckets.";
    return errorResponse(message, { status: 500 });
  }
}
