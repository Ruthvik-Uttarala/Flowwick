import crypto from "node:crypto";

const TOKEN_PREFIX = "v1";
const IV_BYTES = 12;

function getEncryptionSecret(): string {
  return process.env.META_TOKEN_ENCRYPTION_KEY?.trim() ?? "";
}

function getEncryptionKey(): Buffer {
  const secret = getEncryptionSecret();
  if (!secret) {
    throw new Error(
      "Meta token encryption is not configured. Set META_TOKEN_ENCRYPTION_KEY on the server."
    );
  }

  return crypto.createHash("sha256").update(secret, "utf8").digest();
}

export function hasInstagramTokenEncryptionConfigured(): boolean {
  return getEncryptionSecret().length > 0;
}

export function isEncryptedInstagramToken(value: string): boolean {
  return value.trim().startsWith(`${TOKEN_PREFIX}:`);
}

export function encryptInstagramToken(value: string): string {
  const plaintext = value.trim();
  if (!plaintext) return "";

  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv("aes-256-gcm", getEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return `${TOKEN_PREFIX}:${iv.toString("base64")}:${tag.toString("base64")}:${encrypted.toString("base64")}`;
}

export function decryptInstagramToken(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (!isEncryptedInstagramToken(trimmed)) return trimmed;

  const [, ivBase64, tagBase64, payloadBase64] = trimmed.split(":");
  if (!ivBase64 || !tagBase64 || !payloadBase64) {
    throw new Error("Stored Instagram token is malformed.");
  }

  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    getEncryptionKey(),
    Buffer.from(ivBase64, "base64")
  );
  decipher.setAuthTag(Buffer.from(tagBase64, "base64"));

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(payloadBase64, "base64")),
    decipher.final(),
  ]);

  return decrypted.toString("utf8");
}
