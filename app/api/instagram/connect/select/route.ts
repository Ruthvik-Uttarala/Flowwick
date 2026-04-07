import { extractUserId } from "@/src/lib/server/auth";
import { errorResponse, okResponse } from "@/src/lib/server/api-response";
import { selectInstagramCandidate } from "@/src/lib/server/instagram-credentials";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const userId = await extractUserId(request);
    if (!userId) {
      return errorResponse("Not authenticated.", { status: 401 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      pageId?: string;
      instagramBusinessAccountId?: string;
    };
    const pageId = body.pageId?.trim() ?? "";
    const instagramBusinessAccountId = body.instagramBusinessAccountId?.trim() ?? "";

    if (!pageId || !instagramBusinessAccountId) {
      return errorResponse("Select a valid Instagram account.", { status: 400 });
    }

    const instagramConnection = await selectInstagramCandidate({
      userId,
      pageId,
      instagramBusinessAccountId,
    });

    return okResponse({
      instagramConnection,
      message: "Instagram connected successfully.",
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to select the Instagram account.";
    return errorResponse(message, {
      status: message.includes("no longer available") ? 409 : 500,
    });
  }
}
