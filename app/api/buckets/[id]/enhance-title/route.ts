import { extractUserId } from "@/src/lib/server/auth";
import { getActiveCredentials } from "@/src/lib/server/credentials";
import { enhanceBucket } from "@/src/lib/server/workflows";
import { createBucket } from "@/src/lib/server/buckets";
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
      shopifyAdminToken: "",
      shopifyClientId: creds.shopifyClientId,
      shopifyClientSecret: creds.shopifyClientSecret,
      instagramAccessToken: creds.instagramAccessToken,
      instagramBusinessAccountId: creds.instagramBusinessAccountId,
    };

    const { id } = await context.params;
    const result = await enhanceBucket(id, userId, "enhanceTitle", settings);

    if (result.notFound || !result.bucket) {
      const fallback = await createBucket(userId);
      return okResponse({
        bucket: fallback,
        message: "Bucket was missing; created a new one.",
      });
    }

    if (result.error) {
      return errorResponse(result.error, {
        data: { bucket: result.bucket },
        status: 502,
      });
    }

    return okResponse({
      bucket: result.bucket,
      message: "Title enhanced.",
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Title enhancement failed.";
    console.error("[merchflow:enhance-title]", error);
    return errorResponse(message, { status: 500 });
  }
}
