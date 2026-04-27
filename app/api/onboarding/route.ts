import { z, ZodError } from "zod";
import { extractUserId } from "@/src/lib/server/auth";
import { errorResponse, okResponse } from "@/src/lib/server/api-response";
import { getDbSettings } from "@/src/lib/server/db-settings";
import { getSettingsStatus } from "@/src/lib/server/settings";
import { getInstagramConnection } from "@/src/lib/server/instagram-credentials";
import {
  getOnboardingProfile,
  saveOnboardingProfile,
} from "@/src/lib/server/profiles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const onboardingSchema = z
  .object({
    storeName: z.string().trim().max(80).optional(),
    industry: z.string().trim().max(80).optional(),
    instagramHandle: z.string().trim().max(80).optional(),
    niche: z.string().trim().max(140).optional(),
    onboardingCompleted: z.boolean().optional(),
    onboardingStep: z.number().int().min(1).max(3).optional(),
  })
  .strict();

async function buildOnboardingPayload(userId: string) {
  const [onboarding, settings, instagramSummary] = await Promise.all([
    getOnboardingProfile(userId),
    getDbSettings(userId),
    getInstagramConnection(userId),
  ]);
  const status = getSettingsStatus(settings);

  return {
    onboarding: {
      storeName: onboarding.storeName,
      industry: onboarding.industry,
      instagramHandle: onboarding.instagramHandle,
      niche: onboarding.niche,
      onboardingCompleted: onboarding.onboardingCompleted,
      onboardingStep: onboarding.onboardingStep,
    },
    settings: {
      shopifyStoreDomain: settings.shopifyStoreDomain,
      shopifyConnected: status.shopifyConnected,
      shopifyDomainSaved: status.shopifyStoreDomainPresent,
      instagramConnected: instagramSummary.canPublish,
      instagramSummary,
    },
  };
}

export async function GET(request: Request) {
  try {
    const userId = await extractUserId(request);
    if (!userId) {
      return errorResponse("Not authenticated.", { status: 401 });
    }

    return okResponse(await buildOnboardingPayload(userId));
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load onboarding.";
    return errorResponse(message, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const userId = await extractUserId(request);
    if (!userId) {
      return errorResponse("Not authenticated.", { status: 401 });
    }

    const body = await request.json();
    const parsed = onboardingSchema.parse(body);
    await saveOnboardingProfile(userId, parsed);

    return okResponse(await buildOnboardingPayload(userId));
  } catch (error) {
    if (error instanceof ZodError) {
      return errorResponse(error.issues[0]?.message ?? "Invalid onboarding payload.", {
        status: 400,
      });
    }

    const message =
      error instanceof Error ? error.message : "Failed to save onboarding.";
    return errorResponse(message, { status: 500 });
  }
}
