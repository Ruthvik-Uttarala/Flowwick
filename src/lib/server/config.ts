import {
  ConnectionSettings,
  LaunchReadinessStatus,
  SafeSettingsStatus,
  RuntimeConfigSnapshot,
} from "@/src/lib/types";
import { getSettingsStatus } from "@/src/lib/server/settings";
import { getExecutionReadiness } from "@/src/lib/server/runtime";
import { isOpenAIConfigured } from "@/src/lib/server/openai";

export function getSafeSettingsStatus(settings: ConnectionSettings): SafeSettingsStatus {
  return getSettingsStatus(settings);
}

export function getLaunchReadinessStatus(settings: ConnectionSettings): LaunchReadinessStatus {
  const openaiConfigured = isOpenAIConfigured();
  const safeSettings = getSafeSettingsStatus(settings);

  const readyToLaunch = safeSettings.readyForLaunch;
  const modeLabel =
    readyToLaunch && openaiConfigured
      ? "Ready"
      : !openaiConfigured
        ? "OpenAI Key Missing"
        : "Settings Incomplete";

  return {
    appRunning: true,
    liveCapable: openaiConfigured && safeSettings.readyForLaunch,
    readyToLaunch,
    settingsConfigured: safeSettings.configured,
    openaiConfigured,
    missingSettingsFields: getExecutionReadiness(settings).missingRequirements,
    modeLabel,
  };
}

export function getRuntimeConfigSnapshot(settings: ConnectionSettings): RuntimeConfigSnapshot {
  return {
    appRunning: true,
    openaiConfigured: isOpenAIConfigured(),
    settings: getSafeSettingsStatus(settings),
    launch: getLaunchReadinessStatus(settings),
    storage: {
      persistence: "file",
      dataDirectory: "supabase",
      uploadsDirectory: "supabase-storage",
    },
  };
}
