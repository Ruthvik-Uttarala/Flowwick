import { extractUserId } from "@/src/lib/server/auth";
import {
  createBucket,
  getBucketById,
  updateBucket,
} from "@/src/lib/server/buckets";
import { getStableBucketStatus } from "@/src/lib/server/status";
import { saveUploadedFiles } from "@/src/lib/server/uploads";
import { errorResponse, okResponse } from "@/src/lib/server/api-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
]);
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const MAX_TOTAL_SIZE = 50 * 1024 * 1024;
const MAX_FILE_COUNT = 10;

interface ParamsContext {
  params: Promise<{ id: string }>;
}

function collectFiles(formData: FormData): File[] {
  const imageFiles = formData
    .getAll("images")
    .filter((value): value is File => value instanceof File && value.size > 0);
  if (imageFiles.length > 0) {
    return imageFiles;
  }

  return formData
    .getAll("files")
    .filter((value): value is File => value instanceof File && value.size > 0);
}

export async function POST(request: Request, context: ParamsContext) {
  try {
    const userId = await extractUserId(request);
    if (!userId) {
      return errorResponse("Not authenticated.", { status: 401 });
    }

    const { id } = await context.params;
    const existingBucket = (await getBucketById(id, userId)) ?? (await createBucket(userId));

    const formData = await request.formData();
    const files = collectFiles(formData);

    if (files.length === 0) {
      return errorResponse("At least one image file is required.", { status: 400 });
    }

    if (files.length > MAX_FILE_COUNT) {
      return errorResponse(`Maximum ${MAX_FILE_COUNT} files per upload.`, { status: 400 });
    }

    let totalSize = 0;
    for (const file of files) {
      if (!ALLOWED_TYPES.has(file.type)) {
        return errorResponse(
          `File "${file.name}" has unsupported type "${file.type}". Allowed: PNG, JPEG, WebP, GIF.`,
          { status: 400 }
        );
      }
      if (file.size > MAX_FILE_SIZE) {
        return errorResponse(
          `File "${file.name}" exceeds 10 MB limit.`,
          { status: 400 }
        );
      }
      totalSize += file.size;
    }

    if (totalSize > MAX_TOTAL_SIZE) {
      return errorResponse("Total upload size exceeds 50 MB limit.", { status: 400 });
    }

    const imageUrls = await saveUploadedFiles(files);
    const updated = await updateBucket(existingBucket.id, userId, (bucket) => {
      const next = {
        ...bucket,
        imageUrls: [...bucket.imageUrls, ...imageUrls],
        errorMessage: "",
        shopifyCreated: false,
        shopifyProductId: "",
        shopifyProductUrl: "",
        instagramPublished: false,
        instagramPostId: "",
        instagramPostUrl: "",
      };

      return {
        ...next,
        status: getStableBucketStatus(next),
      };
    });

    if (!updated) {
      return okResponse({
        imageUrls: existingBucket.imageUrls,
        bucket: existingBucket,
        message: "Images uploaded.",
      });
    }

    return okResponse({
      imageUrls: updated.imageUrls,
      bucket: updated,
      message: "Images uploaded.",
    });
  } catch (error) {
    console.error("[merchflow:upload]", error);
    const message =
      error instanceof Error ? error.message : "Failed to upload images.";
    return errorResponse(message, { status: 500 });
  }
}
