import { extractUserId } from "@/src/lib/server/auth";
import { errorResponse, okResponse } from "@/src/lib/server/api-response";
import { clearInstagramConnection } from "@/src/lib/server/instagram-credentials";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const userId = await extractUserId(request);
    if (!userId) {
      return errorResponse("Not authenticated.", { status: 401 });
    }

    const instagramConnection = await clearInstagramConnection(userId);
    return okResponse({
      instagramConnection,
      message: "Instagram disconnected.",
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to disconnect Instagram.";
    return errorResponse(message, { status: 500 });
  }
}
