import { extractUserId } from "@/src/lib/server/auth";
import { errorResponse, okResponse } from "@/src/lib/server/api-response";
import { getSupabaseAdmin } from "@/src/lib/server/supabase-admin";
import { saveProfileAvatarUrl } from "@/src/lib/server/profiles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const AVATAR_BUCKET = "profile-avatars";
const MAX_AVATAR_BYTES = 5 * 1024 * 1024;

function extensionFromFile(file: File): string {
  const nameExt = file.name.split(".").pop()?.trim().toLowerCase() ?? "";
  if (nameExt) {
    return nameExt.replace(/[^a-z0-9]/g, "") || "jpg";
  }

  if (file.type === "image/png") return "png";
  if (file.type === "image/webp") return "webp";
  if (file.type === "image/gif") return "gif";
  return "jpg";
}

async function ensureAvatarBucket() {
  const { error } = await getSupabaseAdmin().storage.createBucket(AVATAR_BUCKET, {
    public: true,
  });

  if (error && !error.message.toLowerCase().includes("already exists")) {
    throw new Error(`Failed to prepare avatar bucket: ${error.message}`);
  }
}

export async function POST(request: Request) {
  try {
    const userId = await extractUserId(request);
    if (!userId) {
      return errorResponse("Not authenticated.", { status: 401 });
    }

    const formData = await request.formData();
    const avatar = formData.get("avatar");
    if (!(avatar instanceof File)) {
      return errorResponse("Avatar file is required.", { status: 400 });
    }

    if (!avatar.type.startsWith("image/")) {
      return errorResponse("Only image files are allowed.", { status: 400 });
    }

    if (avatar.size > MAX_AVATAR_BYTES) {
      return errorResponse("Avatar must be 5MB or smaller.", { status: 400 });
    }

    await ensureAvatarBucket();

    const ext = extensionFromFile(avatar);
    const path = `${userId}/avatar.${ext}`;
    const bytes = Buffer.from(await avatar.arrayBuffer());

    const { error: uploadError } = await getSupabaseAdmin().storage
      .from(AVATAR_BUCKET)
      .upload(path, bytes, {
        contentType: avatar.type || "image/jpeg",
        upsert: true,
        cacheControl: "3600",
      });

    if (uploadError) {
      throw new Error(`Failed to upload avatar: ${uploadError.message}`);
    }

    const { data: publicUrlData } = getSupabaseAdmin().storage
      .from(AVATAR_BUCKET)
      .getPublicUrl(path);

    const profile = await saveProfileAvatarUrl(userId, publicUrlData.publicUrl);
    return okResponse({ profile });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to upload avatar.";
    return errorResponse(message, { status: 500 });
  }
}
