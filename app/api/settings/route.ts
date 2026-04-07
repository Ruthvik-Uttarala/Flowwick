import { extractUserId } from "@/src/lib/server/auth";
import { getDbSettings } from "@/src/lib/server/db-settings";
import {
  redactSettingsForClient,
  getSettingsStatus,
} from "@/src/lib/server/settings";
import { getRuntimeConfigSnapshot } from "@/src/lib/server/config";
import { errorResponse, okResponse } from "@/src/lib/server/api-response";
import { getInstagramConnection } from "@/src/lib/server/instagram-credentials";
import { isInstagramDebugFieldModeEnabled } from "@/src/lib/instagram";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const userId = await extractUserId(request);
    if (!userId) {
      return errorResponse("Not authenticated.", { status: 401 });
    }

    const settings = await getDbSettings(userId);
    const instagramConnection = await getInstagramConnection(userId);
    return okResponse({
      settings: redactSettingsForClient(settings),
      status: getSettingsStatus(settings),
      runtime: getRuntimeConfigSnapshot(settings),
      instagramConnection,
      instagramDebugFieldModeEnabled: isInstagramDebugFieldModeEnabled(),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load settings.";
    console.error("[merchflow:settings:get]", error);
    return errorResponse(message, { status: 500 });
  }
}
