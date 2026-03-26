import {
  AiriaConfigStatus,
  ConnectionSettings,
  LaunchReadinessStatus,
  SafeSettingsStatus,
  RuntimeConfigSnapshot,
} from "@/src/lib/types";
import { getSettingsStatus } from "@/src/lib/server/settings";
import { getExecutionReadiness } from "@/src/lib/server/runtime";
import { getStorageDirectory, getUploadsDirectory } from "@/src/lib/server/store";

const DEFAULT_AIRIA_TIMEOUT_MS = 30_000;

function getTrimmedEnv(name: string): string {
  return process.env[name]?.trim() ?? "";
}

function parseTimeoutMs(value: string | undefined): number {
  const parsed = Number.parseInt(value ?? "", 10);
  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed;
  }
  return DEFAULT_AIRIA_TIMEOUT_MS;
}

/**
 * Airia credentials: ONLY from environment variables (global config).
 */
function resolveAiriaCredentials(): {
  apiUrl: string;
  apiKey: string;
  agentId: string;
} {
  return {
    apiUrl: getTrimmedEnv("AIRIA_API_URL"),
    apiKey: getTrimmedEnv("AIRIA_API_KEY"),
    agentId:
      getTrimmedEnv("AIRIA_AGENT_GUID") || getTrimmedEnv("AIRIA_AGENT_ID"),
  };
}

export function getAiriaConfigStatus(): AiriaConfigStatus {
  const { apiUrl, apiKey, agentId } = resolveAiriaCredentials();
  const liveConfigured =
    apiUrl.length > 0 && apiKey.length > 0 && agentId.length > 0;

  return {
    mode: liveConfigured ? "live" : "missing",
    liveConfigured,
    apiUrlPresent: apiUrl.length > 0,
    apiKeyPresent: apiKey.length > 0,
    agentIdPresent: agentId.length > 0,
    request: {
      method: "POST",
      timeoutMs: parseTimeoutMs(process.env.AIRIA_API_TIMEOUT_MS),
      authHeaderName: "Authorization",
      apiKeyHeaderName: "",
      bodyShape: "wrapped",
      customHeaders: { customHeadersPresent: false, customHeaderNames: [] },
    },
  };
}

export function hasLiveAiriaConfig(): boolean {
  return getAiriaConfigStatus().liveConfigured;
}

export interface AiriaRuntimeConfig {
  endpoint: string;
  apiKey: string;
  agentId: string;
  configured: boolean;
  timeoutMs: number;
}

export function getAiriaRuntimeConfig(): AiriaRuntimeConfig {
  const { apiUrl, apiKey, agentId } = resolveAiriaCredentials();
  const configured =
    apiUrl.length > 0 && apiKey.length > 0 && agentId.length > 0;

  const baseUrl = apiUrl.replace(/\/+$/, "");
  const endpoint = agentId ? `${baseUrl}/${agentId}` : baseUrl;

  return {
    endpoint,
    apiKey,
    agentId,
    configured,
    timeoutMs: parseTimeoutMs(process.env.AIRIA_API_TIMEOUT_MS),
  };
}

export function logRuntimeMode(context: string): void {
  const airia = getAiriaConfigStatus();
  console.info(
    `[merchflow:${context}] airiaMode=${airia.mode} liveConfigured=${airia.liveConfigured} apiUrl=${airia.apiUrlPresent ? "yes" : "no"} apiKey=${airia.apiKeyPresent ? "yes" : "no"} agentId=${airia.agentIdPresent ? "yes" : "no"}`
  );
}

export function getSafeSettingsStatus(
  settings: ConnectionSettings
): SafeSettingsStatus {
  return getSettingsStatus(settings);
}

export function getLaunchReadinessStatus(
  settings: ConnectionSettings
): LaunchReadinessStatus {
  const airia = getAiriaConfigStatus();
  const safeSettings = getSafeSettingsStatus(settings);
  const executionReadiness = getExecutionReadiness(settings);
  const missingSettingsFields = executionReadiness.missingRequirements;

  const missingAiriaFields: string[] = [];
  if (!airia.apiUrlPresent) missingAiriaFields.push("AIRIA_API_URL");
  if (!airia.apiKeyPresent) missingAiriaFields.push("AIRIA_API_KEY");
  if (!airia.agentIdPresent) {
    missingAiriaFields.push("AIRIA_AGENT_GUID");
  }

  const readyToLaunch = safeSettings.readyForLaunch && airia.liveConfigured;
  const modeLabel = readyToLaunch
    ? "Live Airia Ready"
    : !airia.liveConfigured
      ? "Live Airia Missing"
      : "External Settings Incomplete";

  return {
    appRunning: true,
    liveCapable: airia.liveConfigured && safeSettings.readyForLaunch,
    readyToLaunch,
    settingsConfigured: safeSettings.readyForLaunch,
    airiaConfigured: airia.liveConfigured,
    missingSettingsFields,
    missingAiriaFields,
    modeLabel,
  };
}

export function getRuntimeConfigSnapshot(
  settings: ConnectionSettings
): RuntimeConfigSnapshot {
  const airia = getAiriaConfigStatus();
  return {
    appRunning: true,
    airiaMode: airia.mode,
    airiaLiveConfigured: airia.liveConfigured,
    airia,
    settings: getSafeSettingsStatus(settings),
    launch: getLaunchReadinessStatus(settings),
    storage: {
      persistence: "file",
      dataDirectory: `${getStorageDirectory().replace(/\\/g, "/")}/data`,
      uploadsDirectory: getUploadsDirectory().replace(/\\/g, "/"),
    },
  };
}
