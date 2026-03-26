import { getSettingsStatus } from "@/src/lib/server/settings";
import { getRuntimeConfigSnapshot } from "@/src/lib/server/config";
import { describeExecutionReadiness } from "@/src/lib/server/runtime";
import { errorResponse, okResponse } from "@/src/lib/server/api-response";
import { extractUserId } from "@/src/lib/server/auth";
import { getDbSettings } from "@/src/lib/server/db-settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EMPTY_SETTINGS = {
  shopifyStoreDomain: "",
  shopifyAdminToken: "",
  instagramAccessToken: "",
  instagramBusinessAccountId: "",
};

export async function GET(request: Request) {
  try {
    const userId = await extractUserId(request);
    const settings = userId ? await getDbSettings(userId) : EMPTY_SETTINGS;
    const snapshot = getRuntimeConfigSnapshot(settings);
    const execution = describeExecutionReadiness(settings);
    return okResponse({
      timestamp: new Date().toISOString(),
      appRunning: true,
      airiaMode: snapshot.airiaMode,
      airiaLiveConfigured: snapshot.airiaLiveConfigured,
      airia: snapshot.airia,
      settings: snapshot.settings,
      settingsStatus: getSettingsStatus(settings),
      launch: snapshot.launch,
      execution,
      storage: snapshot.storage,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Health check failed.";
    return errorResponse(message, { status: 500 });
  }
}
