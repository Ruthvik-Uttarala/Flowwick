import { extractUserId } from "@/src/lib/server/auth";
import { getActiveCredentials } from "@/src/lib/server/credentials";
import { launchBucket } from "@/src/lib/server/workflows";
import { getBucketById } from "@/src/lib/server/buckets";
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

    const creds = await getActiveCredentials(userId);
    const settings = {
      shopifyStoreDomain: creds.shopifyStoreDomain,
      shopifyAdminToken: creds.shopifyAdminToken,
      instagramAccessToken: creds.instagramAccessToken,
      instagramBusinessAccountId: creds.instagramBusinessAccountId,
    };

    const { id } = await context.params;
    const result = await launchBucket(id, userId, settings);

    if (!result.bucket) {
      const fallback = await getBucketById(id, userId);
      if (!fallback) {
        return errorResponse("Bucket not found.", { status: 404 });
      }
      return okResponse({
        bucket: fallback,
        success: fallback.status === "DONE",
        status: fallback.status,
        message: result.error || "Launch completed with warnings.",
      });
    }

    const success = result.bucket.status === "DONE";
    return okResponse({
      bucket: result.bucket,
      status: result.bucket.status,
      success,
      message: success
        ? "Launch completed."
        : result.error || result.bucket.errorMessage || "Launch failed.",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Launch failed unexpectedly.";
    console.error("[flowcart:go]", error);
    return errorResponse(message, { status: 500 });
  }
}
