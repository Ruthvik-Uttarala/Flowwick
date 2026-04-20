import { ZodError } from "zod";
import { extractUserId } from "@/src/lib/server/auth";
import { bucketPatchSchema } from "@/src/lib/server/buckets";
import { getActiveCredentials } from "@/src/lib/server/credentials";
import { syncDoneBucket } from "@/src/lib/server/workflows";
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
    const body = await request.json();
    const patch = bucketPatchSchema.parse(body);
    const creds = await getActiveCredentials(userId);

    const result = await syncDoneBucket(
      id,
      userId,
      patch,
      {
        shopifyStoreDomain: creds.shopifyStoreDomain,
        shopifyAdminToken: creds.shopifyAdminToken,
        instagramAccessToken: creds.instagramAccessToken,
        instagramBusinessAccountId: creds.instagramBusinessAccountId,
      },
      creds.instagramCredentials
    );

    if (result.notFound) {
      return errorResponse(result.error ?? "Bucket not found.", { status: 404 });
    }
    if (!result.result) {
      return errorResponse(result.error ?? "Failed to sync launched bucket.", { status: 400 });
    }

    return okResponse({
      bucket: result.result.bucket,
      sync: {
        shopifyUpdated: result.result.shopifyUpdated,
        shopifyProductId: result.result.shopifyProductId,
        instagramOutcome: result.result.instagramOutcome,
      },
      message: result.result.message,
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return errorResponse(
        error.issues[0]?.message ?? "Invalid sync payload.",
        { status: 400 }
      );
    }

    const message = error instanceof Error ? error.message : "Failed to sync bucket.";
    return errorResponse(message, { status: 500 });
  }
}
