import { isIP } from "node:net";
import { LaunchPayload } from "@/src/lib/types";

export const INSTAGRAM_GRAPH_API_VERSION = "v21.0";
export const INSTAGRAM_CAPTION_MAX_LENGTH = 2200;
export const INSTAGRAM_CONTAINER_POLL_ATTEMPTS = 5;
export const INSTAGRAM_CONTAINER_POLL_DELAY_MS = process.env.NODE_ENV === "test" ? 0 : 1500;

const BLOCKED_HOSTNAMES = new Set(["localhost", "0.0.0.0", "127.0.0.1", "host.docker.internal"]);
const BLOCKED_HOST_SUFFIXES = [
  ".local",
  ".internal",
  ".localhost",
  ".lan",
  ".home",
  ".svc",
  ".cluster.local",
];
const BLOCKED_IMAGE_EXTENSIONS = [".svg", ".gif"];
const JUNK_LITERAL_VALUES = new Set(["undefined", "null", "nan", "[object object]"]);
const AUTH_ERROR_CODES = new Set([102, 190]);
const PERMISSION_ERROR_CODES = new Set([10, 200]);
const TRANSIENT_ERROR_CODES = new Set([1, 2, 4, 17, 32, 341, 613]);

export type InstagramImageUrlSource = "shopify" | "bucket";

export interface SelectedInstagramImageUrl {
  imageUrl: string;
  source: InstagramImageUrlSource;
}

export interface InstagramGraphFailure {
  stage: "create" | "container-status" | "publish" | "permalink";
  message: string;
  status: number;
  code: number | null;
  subcode: number | null;
  type: string;
  isTransient: boolean;
  graphMessage: string;
}

export interface InstagramContainerPollSuccess {
  ok: true;
  attempts: number;
  statusCode: string;
}

export interface InstagramContainerPollFailure {
  ok: false;
  attempts: number;
  statusCode: string;
  error: InstagramGraphFailure;
}

export type InstagramContainerPollResult =
  | InstagramContainerPollSuccess
  | InstagramContainerPollFailure;

interface InstagramGraphErrorPayload {
  message?: unknown;
  type?: unknown;
  code?: unknown;
  error_subcode?: unknown;
  is_transient?: unknown;
  error_user_title?: unknown;
  error_user_msg?: unknown;
}

interface InstagramContainerStatusResponse {
  status_code?: unknown;
  error?: unknown;
}

interface PollInstagramContainerStatusInput {
  creationId: string;
  accessToken: string;
  fetchFn?: typeof fetch;
  maxAttempts?: number;
  delayMs?: number;
}

function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&nbsp;/gi, " ")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function stripHtml(input: string): string {
  return input
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/\s*p\s*>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
}

function collapseWhitespace(input: string): string {
  return input
    .replace(/\r\n?/g, "\n")
    .replace(/\u00a0/g, " ")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizePunctuation(input: string): string {
  return input
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/([,.;:!?]){2,}/g, "$1")
    .replace(/([,.;:!?])\s*([,.;:!?])/g, "$1")
    .replace(/^[,.;:!?]+/g, "")
    .trim();
}

function sanitizeFragment(value: unknown): string {
  if (typeof value !== "string") return "";
  const decoded = decodeHtmlEntities(value);
  const withoutHtml = stripHtml(decoded);
  const collapsed = collapseWhitespace(withoutHtml);
  const withoutJunkTokens = collapsed
    .replace(/\[object object\]/gi, " ")
    .replace(/\b(?:undefined|null|nan)\b/gi, " ");
  const normalized = normalizePunctuation(collapseWhitespace(withoutJunkTokens));
  if (!normalized) return "";
  const lowered = normalized.toLowerCase();
  if (JUNK_LITERAL_VALUES.has(lowered)) return "";
  if (/^[\s.,;:!?-]*$/.test(normalized)) return "";
  return normalized;
}

function truncateText(input: string, maxLength: number): string {
  if (maxLength <= 0) return "";
  if (input.length <= maxLength) return input;
  if (maxLength <= 1) return input.slice(0, maxLength);

  const reserved = maxLength > 3 ? 3 : 1;
  const sliceLength = Math.max(1, maxLength - reserved);
  const sliced = input.slice(0, sliceLength).trimEnd();
  const lastSpace = sliced.lastIndexOf(" ");
  const base = lastSpace >= Math.floor(sliceLength * 0.6) ? sliced.slice(0, lastSpace) : sliced;
  const trimmed = base.trimEnd().replace(/[,:;.!?-]+$/g, "");
  return `${trimmed || sliced}${maxLength > 3 ? "..." : "."}`;
}

function formatPrice(price: number): string {
  if (!Number.isFinite(price)) return "";
  return `Price: $${price.toFixed(2)}`;
}

function formatQuantity(quantity: number): string {
  if (!Number.isFinite(quantity) || quantity <= 0) return "";
  return `Quantity: ${Math.trunc(quantity)}`;
}

function buildCaptionSections(
  title: string,
  description: string,
  metaLines: string[],
  shopLine: string
): string[] {
  const sections = [title, description];
  const metaBlock = metaLines.filter(Boolean).join("\n");
  if (metaBlock) sections.push(metaBlock);
  if (shopLine) sections.push(shopLine);
  return sections.filter(Boolean);
}

function joinCaptionSections(sections: string[]): string {
  return sections.filter(Boolean).join("\n\n");
}

function isPreviewHostname(hostname: string): boolean {
  return hostname.endsWith(".vercel.app") && hostname.includes("-git-");
}

function isBlockedIpv4(hostname: string): boolean {
  const parts = hostname.split(".").map((part) => Number.parseInt(part, 10));
  if (parts.length !== 4 || parts.some((part) => Number.isNaN(part) || part < 0 || part > 255)) {
    return true;
  }

  const [a, b] = parts;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a === 198 && (b === 18 || b === 19)) return true;
  return false;
}

function isBlockedIpv6(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  if (normalized.startsWith("::ffff:")) {
    const mappedIpv4 = normalized.slice("::ffff:".length);
    return isIP(mappedIpv4) === 4 ? isBlockedIpv4(mappedIpv4) : true;
  }
  return (
    normalized === "::" ||
    normalized === "::1" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("fe8") ||
    normalized.startsWith("fe9") ||
    normalized.startsWith("fea") ||
    normalized.startsWith("feb")
  );
}

function isBlockedHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  if (!normalized) return true;
  if (BLOCKED_HOSTNAMES.has(normalized)) return true;
  if (normalized.includes("localhost")) return true;
  if (BLOCKED_HOST_SUFFIXES.some((suffix) => normalized.endsWith(suffix))) return true;
  if (isPreviewHostname(normalized)) return true;
  if (!normalized.includes(".") && isIP(normalized) === 0) return true;

  const ipVersion = isIP(normalized);
  if (ipVersion === 4) return isBlockedIpv4(normalized);
  if (ipVersion === 6) return isBlockedIpv6(normalized);
  return false;
}

function hasBlockedExtension(pathname: string): boolean {
  const normalized = pathname.toLowerCase();
  return BLOCKED_IMAGE_EXTENSIONS.some(
    (extension) => normalized === extension || normalized.endsWith(extension)
  );
}

function isAbsoluteHttpsUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function buildDefaultStageMessage(
  stage: InstagramGraphFailure["stage"],
  detail: string
): string {
  const suffix = detail ? `: ${detail}` : ".";
  if (stage === "create") return `Instagram media container creation failed${suffix}`;
  if (stage === "container-status") return `Instagram media processing failed before publish${suffix}`;
  if (stage === "publish") return `Instagram publish failed${suffix}`;
  return `Instagram permalink lookup failed${suffix}`;
}

function sanitizeGraphMessage(message: string): string {
  return message
    .replace(/access_token=[^&\s]+/gi, "access_token=[redacted]")
    .replace(/\bEA[A-Za-z0-9._-]+\b/g, "[redacted]")
    .replace(/\s+/g, " ")
    .trim();
}

function extractGraphError(payload: unknown): InstagramGraphErrorPayload | null {
  if (!payload || typeof payload !== "object" || !("error" in payload)) return null;
  const error = (payload as { error?: unknown }).error;
  if (!error || typeof error !== "object") return null;
  return error as InstagramGraphErrorPayload;
}

export async function readInstagramJsonResponse<T>(response: Response): Promise<T | null> {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    const raw = await response.text().catch(() => "");
    return (raw ? ({ raw } as unknown as T) : null) as T | null;
  }
  return response.json().catch(() => null);
}

export function isValidInstagramPublishImageUrl(url: string): boolean {
  try {
    const parsed = new URL(url.trim());
    if (parsed.protocol !== "https:") return false;
    if (isBlockedHostname(parsed.hostname)) return false;
    if (hasBlockedExtension(parsed.pathname)) return false;
    return true;
  } catch {
    return false;
  }
}

export function selectInstagramImageUrl(
  payload: LaunchPayload,
  shopifyImageUrl?: string
): SelectedInstagramImageUrl | null {
  const shopifyCandidate = shopifyImageUrl?.trim() ?? "";
  if (shopifyCandidate && isValidInstagramPublishImageUrl(shopifyCandidate)) {
    return { imageUrl: shopifyCandidate, source: "shopify" };
  }

  for (const imageUrl of payload.imageUrls) {
    const candidate = imageUrl.trim();
    if (isValidInstagramPublishImageUrl(candidate)) {
      return { imageUrl: candidate, source: "bucket" };
    }
  }

  return null;
}

export function selectInstagramCarouselImageUrls(payload: LaunchPayload): string[] {
  const selected: string[] = [];

  for (const imageUrl of payload.imageUrls) {
    const candidate = imageUrl.trim();
    if (!isValidInstagramPublishImageUrl(candidate)) {
      continue;
    }

    selected.push(candidate);
    if (selected.length >= 10) {
      break;
    }
  }

  return selected;
}

export function buildInstagramCaption(
  payload: LaunchPayload,
  shopifyProductUrl?: string
): string {
  const title = sanitizeFragment(payload.title);
  const description = sanitizeFragment(payload.description);
  const metaLines = [formatPrice(payload.price), formatQuantity(payload.quantity)].filter(Boolean);
  const shopLine =
    shopifyProductUrl && isAbsoluteHttpsUrl(shopifyProductUrl.trim())
      ? `Shop now: ${shopifyProductUrl.trim()}`
      : "";

  const reservedSections = buildCaptionSections(title, "", metaLines, shopLine);
  const reservedCaption = joinCaptionSections(reservedSections);
  const separatorCost = description ? 2 : 0;
  const remainingBudget = INSTAGRAM_CAPTION_MAX_LENGTH - reservedCaption.length - separatorCost;
  const safeDescription =
    description && remainingBudget > 0 ? truncateText(description, remainingBudget) : "";

  const fullSections = buildCaptionSections(title, safeDescription, metaLines, shopLine);
  let caption = joinCaptionSections(fullSections);
  if (caption.length <= INSTAGRAM_CAPTION_MAX_LENGTH) return caption;

  const reserveWithoutTitle = buildCaptionSections("", safeDescription, metaLines, shopLine);
  const withoutTitleCaption = joinCaptionSections(reserveWithoutTitle);
  const titleBudget =
    INSTAGRAM_CAPTION_MAX_LENGTH -
    withoutTitleCaption.length -
    (title && withoutTitleCaption ? 2 : 0);
  const safeTitle = titleBudget > 0 ? truncateText(title, titleBudget) : "";
  caption = joinCaptionSections(buildCaptionSections(safeTitle, safeDescription, metaLines, shopLine));

  if (caption.length <= INSTAGRAM_CAPTION_MAX_LENGTH) return caption;
  return truncateText(caption, INSTAGRAM_CAPTION_MAX_LENGTH);
}

export function normalizeInstagramGraphError(
  payload: unknown,
  status: number,
  stage: InstagramGraphFailure["stage"]
): InstagramGraphFailure {
  const error = extractGraphError(payload);
  const code = typeof error?.code === "number" ? error.code : null;
  const subcode = typeof error?.error_subcode === "number" ? error.error_subcode : null;
  const type = typeof error?.type === "string" ? error.type : "";
  const isTransient = Boolean(error?.is_transient) || status === 429 || TRANSIENT_ERROR_CODES.has(code ?? -1);

  const detailSource =
    (typeof error?.error_user_msg === "string" && error.error_user_msg) ||
    (typeof error?.message === "string" && error.message) ||
    "";
  const detail = sanitizeGraphMessage(detailSource);
  const loweredDetail = detail.toLowerCase();

  let message = buildDefaultStageMessage(stage, detail);

  if (AUTH_ERROR_CODES.has(code ?? -1) || status === 401 || /oauth|access token|expired|reauthoriz/i.test(loweredDetail)) {
    message = "Instagram authentication failed. Reconnect Instagram and try again.";
  } else if (
    PERMISSION_ERROR_CODES.has(code ?? -1) ||
    status === 403 ||
    /permission|not authorized|unsupported post request|manage pages|instagram_content_publish/i.test(
      loweredDetail
    )
  ) {
    message =
      "Instagram permissions are missing or incomplete. Reconnect Instagram and verify Meta permissions.";
  } else if (
    isTransient ||
    /rate limit|temporarily unavailable|try again later|please reduce/i.test(loweredDetail)
  ) {
    message = "Instagram is temporarily unavailable or rate limited. Retry in a few minutes.";
  } else if (
    stage === "create" &&
    /image_url|image url|download|fetch|reachable|public url|unsupported image|format/i.test(
      loweredDetail
    )
  ) {
    message =
      "Instagram could not fetch the selected image URL. Use a public HTTPS JPG or PNG image and retry.";
  } else if (stage === "container-status" && /timeout|processing|error|expired/i.test(loweredDetail)) {
    message = "Instagram media processing failed before publish. Retry with a valid image.";
  }

  return {
    stage,
    message,
    status,
    code,
    subcode,
    type,
    isTransient,
    graphMessage: detail,
  };
}

function buildContainerStatusFailure(
  message: string,
  statusCode: string,
  attempts: number
): InstagramContainerPollFailure {
  return {
    ok: false,
    attempts,
    statusCode,
    error: {
      stage: "container-status",
      message,
      status: 200,
      code: null,
      subcode: null,
      type: "",
      isTransient: false,
      graphMessage: statusCode,
    },
  };
}

function sleep(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function pollInstagramContainerStatus(
  input: PollInstagramContainerStatusInput
): Promise<InstagramContainerPollResult> {
  const fetchFn = input.fetchFn ?? fetch;
  const maxAttempts = input.maxAttempts ?? INSTAGRAM_CONTAINER_POLL_ATTEMPTS;
  const delayMs = input.delayMs ?? INSTAGRAM_CONTAINER_POLL_DELAY_MS;
  const params = new URLSearchParams({
    fields: "status_code",
    access_token: input.accessToken,
  });

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const response = await fetchFn(
      `https://graph.facebook.com/${INSTAGRAM_GRAPH_API_VERSION}/${input.creationId}?${params.toString()}`
    );
    const payload = await readInstagramJsonResponse<InstagramContainerStatusResponse>(response);

    if (!response.ok || payload?.error) {
      return {
        ok: false,
        attempts: attempt,
        statusCode: "",
        error: normalizeInstagramGraphError(payload, response.status, "container-status"),
      };
    }

    const statusCode =
      typeof payload?.status_code === "string" ? payload.status_code.trim().toUpperCase() : "";
    if (!statusCode) {
      return buildContainerStatusFailure(
        "Instagram did not return a valid media container status.",
        "",
        attempt
      );
    }

    if (statusCode === "FINISHED" || statusCode === "PUBLISHED") {
      return { ok: true, attempts: attempt, statusCode };
    }

    if (statusCode === "ERROR" || statusCode === "EXPIRED") {
      return buildContainerStatusFailure(
        `Instagram media processing failed before publish (${statusCode.toLowerCase()}).`,
        statusCode,
        attempt
      );
    }

    if (attempt < maxAttempts) {
      await sleep(delayMs);
    }
  }

  return buildContainerStatusFailure(
    "Instagram media processing timed out before publish. Retry in a moment.",
    "TIMEOUT",
    maxAttempts
  );
}
