import { extractUserId } from "@/src/lib/server/auth";
import { getActiveCredentials } from "@/src/lib/server/credentials";
import { getBuckets } from "@/src/lib/server/buckets";
import { goAllSequentially } from "@/src/lib/server/workflows";
import { errorResponse, okResponse } from "@/src/lib/server/api-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
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

    const summary = await goAllSequentially(userId, settings);
    const buckets = await getBuckets(userId);
    return okResponse({ summary, buckets, message: "Sequential Go(All) completed." });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to process ready buckets.";
    console.error("[flowcart:go-all]", error);
    return errorResponse(message, { status: 500 });
  }
}
