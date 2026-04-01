import { enhanceTitleViaOpenAI, enhanceDescriptionViaOpenAI } from "@/src/lib/server/openai";
import { errorResponse, okResponse } from "@/src/lib/server/api-response";
import { extractUserId } from "@/src/lib/server/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const userId = await extractUserId(request);
    if (!userId) {
      return errorResponse("Not authenticated.", { status: 401 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return errorResponse("Invalid JSON body.", { status: 400 });
    }

    if (!body || typeof body !== "object") {
      return errorResponse("Request body must be an object.", { status: 400 });
    }

    const { text, type } = body as Record<string, unknown>;

    if (typeof text !== "string" || !text.trim()) {
      return errorResponse("Field 'text' is required and must be a non-empty string.", { status: 400 });
    }

    if (type !== "title" && type !== "description") {
      return errorResponse("Field 'type' must be 'title' or 'description'.", { status: 400 });
    }

    const enhanced =
      type === "title"
        ? await enhanceTitleViaOpenAI(text)
        : await enhanceDescriptionViaOpenAI(text);

    return okResponse({ enhanced });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Enhancement failed.";
    console.error("[flowcart:enhance]", error);
    return errorResponse(message, { status: 500 });
  }
}
