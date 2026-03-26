import { getSettingsStatus } from "@/src/lib/server/settings";
import { getRuntimeConfigSnapshot, getAiriaConfigStatus } from "@/src/lib/server/config";
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
      readyToLaunch: execution.readyToLaunch,
      modeLabel: execution.modeLabel,
      liveCapable:
        snapshot.airiaLiveConfigured &&
        execution.shopifyDirectExecutionReady &&
        execution.instagramConfigured,
      settingsConfigured: getSettingsStatus(settings).configured,
      airiaConfigured: snapshot.launch.airiaConfigured,
      missingSettingsFields: execution.missingRequirements,
      missingAiriaFields: snapshot.launch.missingAiriaFields,
      settingsStatus: getSettingsStatus(settings),
      execution,
      launch: snapshot.launch,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Readiness check failed.";
    return errorResponse(message, { status: 500 });
  }
}
