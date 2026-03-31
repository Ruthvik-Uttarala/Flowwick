import { z } from "zod";
import { AiriaPayload, AiriaResult } from "@/src/lib/types";
import { getAiriaRuntimeConfig, logRuntimeMode } from "@/src/lib/server/config";

type AiriaPayloadWithoutMode = Omit<AiriaPayload, "mode">;
type AiriaEnhancementOutput = {
  title: string;
  description: string;
};

const airiaPayloadSchema = z.object({
  storeDomain: z.string(),
  shopifyAdminToken: z.string(),
  instagramAccessToken: z.string(),
  instagramBusinessAccountId: z.string(),
  titleRaw: z.string(),
  descriptionRaw: z.string(),
  price: z.number().nonnegative(),
  quantity: z.number().int().nonnegative(),
  imageUrls: z.array(z.string()),
  mode: z.enum(["enhanceTitle", "enhanceDescription", "fullLaunch"]),
});

const airiaResultDefaults: AiriaResult = {
  success: false,
  enhancedTitle: "",
  enhancedDescription: "",
  shopifyCreated: false,
  shopifyProductId: "",
  shopifyProductUrl: "",
  instagramPublished: false,
  instagramPostId: "",
  instagramPostUrl: "",
  errorMessage: "",
};

function createFailureResult(message: string): AiriaResult {
  return { ...airiaResultDefaults, errorMessage: message };
}

function previewBodyForLog(value: unknown): string {
  if (typeof value === "string") return value.slice(0, 400);
  try {
    return JSON.stringify(value).slice(0, 400);
  } catch {
    return "[unserializable]";
  }
}

/**
 * Build the prompt for Airia based on mode.
 */
function buildUserMessage(payload: AiriaPayload): string {
  if (payload.mode === "enhanceTitle") {
    return `Enhance this product title for e-commerce. Make it concise, elegant, and SEO-friendly (max 70 characters). Input: "${payload.titleRaw}". Return ONLY the enhanced title, nothing else.`;
  }
  if (payload.mode === "enhanceDescription") {
    return `Enhance this product description for e-commerce. Make it polished, professional, and conversion-optimized. Input: "${payload.descriptionRaw}". Return ONLY the enhanced description, nothing else.`;
  }
  return `Enhance this product for e-commerce launch. Title: "${payload.titleRaw}". Description: "${payload.descriptionRaw}". Price: $${payload.price}. Quantity: ${payload.quantity}. Return a JSON object with keys "enhancedTitle" and "enhancedDescription".`;
}

function extractJsonFromText(raw: string): Record<string, unknown> | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const candidate = fencedMatch?.[1]?.trim() || trimmed;
  try {
    return JSON.parse(candidate) as Record<string, unknown>;
  } catch {
    const firstBrace = candidate.indexOf("{");
    const lastBrace = candidate.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      try {
        return JSON.parse(
          candidate.slice(firstBrace, lastBrace + 1)
        ) as Record<string, unknown>;
      } catch {
        return null;
      }
    }
    return null;
  }
}

function readStringKey(value: unknown, keys: string[]): string {
  if (!value || typeof value !== "object") return "";
  const candidate = value as Record<string, unknown>;
  for (const key of keys) {
    const raw = candidate[key];
    if (typeof raw === "string" && raw.trim()) return raw.trim();
  }
  return "";
}

function normalizeAiriaResponse(
  input: unknown,
  mode: AiriaPayload["mode"]
): AiriaResult {
  let candidate = input;

  // Unwrap common wrapper shapes
  if (typeof candidate === "object" && candidate !== null) {
    const obj = candidate as Record<string, unknown>;
    candidate =
      obj.result ?? obj.data ?? obj.response ?? obj.output ?? obj.value ?? obj.content ?? candidate;
  }

  // If content is an array (like Claude API format), extract text
  if (Array.isArray(candidate)) {
    const textItem = candidate.find(
      (item: unknown) =>
        typeof item === "object" && item !== null && "text" in (item as Record<string, unknown>)
    ) as { text?: string } | undefined;
    if (textItem?.text) {
      candidate = textItem.text;
    }
  }

  if (typeof candidate === "string") {
    const parsed = extractJsonFromText(candidate);
    if (parsed) {
      candidate = parsed;
    } else {
      const cleaned = candidate.replace(/^["'`]+|["'`]+$/g, "").trim();
      if (mode === "enhanceTitle") {
        return {
          ...airiaResultDefaults,
          success: cleaned.length > 0,
          enhancedTitle: cleaned.slice(0, 120),
        };
      }
      if (mode === "enhanceDescription") {
        return {
          ...airiaResultDefaults,
          success: cleaned.length > 0,
          enhancedDescription: cleaned.slice(0, 3000),
        };
      }
      return createFailureResult("Airia returned unstructured text.");
    }
  }

  if (typeof candidate === "object" && candidate !== null) {
    const obj = candidate as Record<string, unknown>;
    const enhancedTitle =
      readStringKey(obj, ["enhancedTitle", "enhanced_title", "title", "headline"]) ||
      readStringKey(input, ["enhancedTitle", "enhanced_title", "title"]);
    const enhancedDescription =
      readStringKey(obj, ["enhancedDescription", "enhanced_description", "description", "body"]) ||
      readStringKey(input, ["enhancedDescription", "enhanced_description", "description"]);

    const success =
      typeof obj.success === "boolean"
        ? obj.success
        : Boolean(enhancedTitle || enhancedDescription);

    return {
      success,
      enhancedTitle,
      enhancedDescription,
      shopifyCreated: false,
      shopifyProductId: "",
      shopifyProductUrl: "",
      instagramPublished: false,
      instagramPostId: "",
      instagramPostUrl: "",
      errorMessage: typeof obj.errorMessage === "string" ? obj.errorMessage : "",
    };
  }

  return createFailureResult("Airia returned an invalid response shape.");
}

async function readResponseBody(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    return response.json().catch(() => ({}));
  }
  const text = await response.text().catch(() => "");
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

async function executeAiriaRequest(
  payload: AiriaPayload
): Promise<AiriaResult> {
  const runtime = getAiriaRuntimeConfig();

  logRuntimeMode("airia");

  if (!runtime.configured) {
    console.error(
      "[merchflow:airia] Airia not configured. Set AIRIA_API_URL, AIRIA_API_KEY, AIRIA_AGENT_GUID in env."
    );
    return createFailureResult(
      "Airia is not configured. Set AIRIA_API_URL, AIRIA_API_KEY, and AIRIA_AGENT_GUID environment variables."
    );
  }

  const userMessage = buildUserMessage(payload);
  const requestBody = { userMessage };

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-API-Key": runtime.apiKey,
  };

  console.log("[merchflow:airia] Airia request", {
    url: runtime.endpoint,
    agentId: runtime.agentId,
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": "***",
    },
    body: { userMessage: userMessage.slice(0, 200) + "..." },
  });

  const controller = new AbortController();
  const timeoutHandle = setTimeout(
    () => controller.abort(),
    runtime.timeoutMs
  );

  try {
    const response = await fetch(runtime.endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });

    const responseBody = await readResponseBody(response);

    console.log("[merchflow:airia] Airia response", {
      status: response.status,
      body: previewBodyForLog(responseBody),
    });

    if (!response.ok) {
      console.error(
        `[merchflow:airia] Airia returned ${response.status}:`,
        previewBodyForLog(responseBody)
      );

      // Try alternative payload shapes on failure
      if (response.status === 400 || response.status === 422) {
        console.log("[merchflow:airia] Retrying with alternative payload shapes...");
        for (const altBody of [
          { input: userMessage },
          { message: userMessage },
          { prompt: userMessage },
          { messages: [{ role: "user", content: userMessage }] },
        ]) {
          const altResponse = await fetch(runtime.endpoint, {
            method: "POST",
            headers,
            body: JSON.stringify(altBody),
          });
          if (altResponse.ok) {
            const altResponseBody = await readResponseBody(altResponse);
            console.log("[merchflow:airia] Alternative payload succeeded:", {
              shape: Object.keys(altBody),
              body: previewBodyForLog(altResponseBody),
            });
            return normalizeAiriaResponse(altResponseBody, payload.mode);
          }
        }
      }

      const normalized = normalizeAiriaResponse(responseBody, payload.mode);
      return {
        ...normalized,
        success: false,
        errorMessage:
          normalized.errorMessage ||
          `Airia request failed with status ${response.status}.`,
      };
    }

    return normalizeAiriaResponse(responseBody, payload.mode);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown Airia error.";
    console.error("[merchflow:airia] Request failed:", message);
    return createFailureResult(`Airia request failed: ${message}`);
  } finally {
    clearTimeout(timeoutHandle);
  }
}

export async function runAiria(rawPayload: unknown): Promise<AiriaResult> {
  const payload = airiaPayloadSchema.parse(rawPayload);

  const firstAttempt = await executeAiriaRequest(payload);

  if (
    !firstAttempt.success &&
    firstAttempt.errorMessage.includes("status 500")
  ) {
    console.warn(
      `[merchflow:airia] Retrying after 500 error mode=${payload.mode}`
    );
    return executeAiriaRequest(payload);
  }

  return firstAttempt;
}

export async function callAiriaAgent(
  payload: AiriaPayload
): Promise<AiriaResult> {
  return runAiria(payload);
}

function toEnhancementOutput(
  payload: AiriaPayloadWithoutMode,
  mode: "enhanceTitle" | "enhanceDescription",
  result: AiriaResult
): AiriaEnhancementOutput {
  const title = result.enhancedTitle.trim();
  const description = result.enhancedDescription.trim();

  if (mode === "enhanceTitle" && (!result.success || !title)) {
    throw new Error(
      result.errorMessage || "Airia did not return an enhanced title."
    );
  }

  if (mode === "enhanceDescription" && (!result.success || !description)) {
    throw new Error(
      result.errorMessage || "Airia did not return an enhanced description."
    );
  }

  return {
    title: mode === "enhanceTitle" ? title : payload.titleRaw.trim(),
    description:
      mode === "enhanceDescription" ? description : payload.descriptionRaw.trim(),
  };
}

export async function enhanceTitleViaAiria(
  payload: AiriaPayloadWithoutMode
): Promise<AiriaEnhancementOutput> {
  const result = await callAiriaAgent({ ...payload, mode: "enhanceTitle" });
  return toEnhancementOutput(payload, "enhanceTitle", result);
}

export async function enhanceDescriptionViaAiria(
  payload: AiriaPayloadWithoutMode
): Promise<AiriaEnhancementOutput> {
  const result = await callAiriaAgent({
    ...payload,
    mode: "enhanceDescription",
  });
  return toEnhancementOutput(payload, "enhanceDescription", result);
}

export async function fullLaunchViaAiria(
  payload: AiriaPayloadWithoutMode
): Promise<AiriaResult> {
  return callAiriaAgent({ ...payload, mode: "fullLaunch" });
}
