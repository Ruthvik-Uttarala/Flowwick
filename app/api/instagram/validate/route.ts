import { extractUserId } from "@/src/lib/server/auth";
import { errorResponse, okResponse } from "@/src/lib/server/api-response";
import { validateInstagramConnection } from "@/src/lib/server/instagram-credentials";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const userId = await extractUserId(request);
    if (!userId) {
      return errorResponse("Not authenticated.", { status: 401 });
    }

    const instagramConnection = await validateInstagramConnection(userId);
    return okResponse({
      instagramConnection,
      message:
        instagramConnection.status === "connected"
          ? "Instagram connection is valid."
          : `Instagram status: ${instagramConnection.statusLabel}.`,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to validate the Instagram connection.";
    return errorResponse(message, { status: 500 });
  }
}
