import { extractUserId } from "@/src/lib/server/auth";
import {
  getBuckets,
  getTrashedBuckets,
  restoreBucketFromTrash,
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
    const bucket = await restoreBucketFromTrash(id, userId);
    if (!bucket) {
      return errorResponse("Bucket not found in trash.", { status: 404 });
    }

    const [buckets, trashedBuckets] = await Promise.all([
      getBuckets(userId),
      getTrashedBuckets(userId),
    ]);

    return okResponse({
      bucket,
      buckets,
      trashedBuckets,
      message: "Bucket restored from trash.",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to restore bucket.";
    return errorResponse(message, { status: 500 });
  }
}
