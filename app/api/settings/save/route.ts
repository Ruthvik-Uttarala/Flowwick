import { ZodError } from "zod";
import { extractUserId } from "@/src/lib/server/auth";
import { saveDbSettings } from "@/src/lib/server/db-settings";
import {
  settingsSchema,
  getSettingsStatus,
  redactSettingsForClient,
} from "@/src/lib/server/settings";
import { getRuntimeConfigSnapshot } from "@/src/lib/server/config";
import { errorResponse, okResponse } from "@/src/lib/server/api-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const userId = await extractUserId(request);
    if (!userId) {
      return errorResponse("Not authenticated.", { status: 401 });
    }

    const body = await request.json();
    const parsed = settingsSchema.parse(body);

    const saved = await saveDbSettings(userId, parsed);

    return okResponse({
      settings: redactSettingsForClient(saved),
      status: getSettingsStatus(saved),
      runtime: getRuntimeConfigSnapshot(saved),
      message: "Settings saved.",
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return errorResponse(
        error.issues[0]?.message ?? "Invalid settings payload.",
        { status: 400 }
      );
    }

    const message =
      error instanceof Error ? error.message : "Failed to save settings.";
    console.error("[merchflow:settings:save]", error);
    return errorResponse(message, { status: 500 });
  }
}
