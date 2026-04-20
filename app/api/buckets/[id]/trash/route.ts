import { extractUserId } from "@/src/lib/server/auth";
import {
  getBuckets,
  getTrashedBuckets,
  moveBucketToTrash,
} from "@/src/lib/server/buckets";
import { errorResponse, okResponse } from "@/src/lib/server/api-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ParamsContext {
  params: Promise<{ id: string }>;
}

export async function POST(request: Request, context: ParamsContext) {
  try {
    const userId = await extractUserId(request);
    if (!userId) {
      return errorResponse("Not authenticated.", { status: 401 });
    }

    const { id } = await context.params;
    const bucket = await moveBucketToTrash(id, userId);
    if (!bucket) {
      return errorResponse("Bucket not found.", { status: 404 });
    }

    const [buckets, trashedBuckets] = await Promise.all([
      getBuckets(userId),
      getTrashedBuckets(userId),
    ]);

    return okResponse({
      bucket,
      buckets,
      trashedBuckets,
      message: "Bucket moved to trash for 30 days.",
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to move bucket to trash.";
    return errorResponse(message, {
      status: message.includes("Only failed buckets") ? 400 : 500,
    });
  }
}
