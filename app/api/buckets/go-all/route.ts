import { extractUserId } from "@/src/lib/server/auth";
import { getDbSettings } from "@/src/lib/server/db-settings";
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

    const settings = await getDbSettings(userId);
    const summary = await goAllSequentially(settings);
    const buckets = await getBuckets();
    return okResponse({
      summary,
      buckets,
      message: "Sequential Go(All) completed.",
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to process ready buckets.";
    console.error("[merchflow:go-all]", error);
    return errorResponse(message, { status: 500 });
  }
}
