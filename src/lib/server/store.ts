import { constants as fsConstants } from "node:fs";
import { access, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { ConnectionSettings, ProductBucket } from "@/src/lib/types";

function getStorageRoot(): string {
  const explicit = process.env.MERCHFLOW_STORAGE_DIR?.trim();
  if (explicit) {
    return path.resolve(explicit);
  }

  if (process.env.VERCEL || process.env.VERCEL_ENV) {
    return path.join(os.tmpdir(), "flowcart-storage");
  }

  return process.cwd();
}

const STORAGE_ROOT = getStorageRoot();
const DATA_DIR = path.join(STORAGE_ROOT, "data");
const UPLOADS_DIR = path.join(STORAGE_ROOT, "uploads");
const SETTINGS_FILE = path.join(DATA_DIR, "settings.json");
const BUCKETS_FILE = path.join(DATA_DIR, "buckets.json");

const DEFAULT_SETTINGS: ConnectionSettings = {
  shopifyStoreDomain: "",
  shopifyAdminToken: "",
  shopifyAccessToken: "",
  shopifyClientId: "",
  shopifyClientSecret: "",
  instagramAccessToken: "",
  instagramBusinessAccountId: "",
};

let writeQueue: Promise<void> = Promise.resolve();

function queueWrite(task: () => Promise<void>): Promise<void> {
  const nextWrite = writeQueue.then(task, task);
  writeQueue = nextWrite.catch(() => undefined);
  return nextWrite;
}

async function ensureDirectory(dirPath: string): Promise<void> {
  await mkdir(dirPath, { recursive: true });
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function ensureJsonFile<T>(filePath: string, fallback: T): Promise<void> {
  const exists = await fileExists(filePath);
  if (!exists) {
    await writeJsonFile(filePath, fallback);
  }
}

async function readJsonFile<T>(filePath: string, fallback: T): Promise<T> {
  try {
    const raw = await readFile(filePath, "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

async function writeJsonFile<T>(filePath: string, value: T): Promise<void> {
  const payload = `${JSON.stringify(value, null, 2)}\n`;
  const tempFilePath = `${filePath}.${Date.now()}.tmp`;
  await writeFile(tempFilePath, payload, "utf8");
  await rename(tempFilePath, filePath);
}

export async function ensureStorageReady(): Promise<void> {
  await ensureDirectory(DATA_DIR);
  await ensureDirectory(UPLOADS_DIR);
  await ensureJsonFile(SETTINGS_FILE, DEFAULT_SETTINGS);
  await ensureJsonFile(BUCKETS_FILE, []);
}

export function getUploadsDirectory(): string {
  return UPLOADS_DIR;
}

export function getStorageDirectory(): string {
  return STORAGE_ROOT;
}

export async function readSettingsFile(): Promise<ConnectionSettings> {
  await ensureStorageReady();
  return readJsonFile(SETTINGS_FILE, DEFAULT_SETTINGS);
}

export async function writeSettingsFile(settings: ConnectionSettings): Promise<void> {
  await ensureStorageReady();
  await queueWrite(async () => {
    await writeJsonFile(SETTINGS_FILE, settings);
  });
}

export async function readBucketsFile(): Promise<ProductBucket[]> {
  await ensureStorageReady();
  return readJsonFile(BUCKETS_FILE, []);
}

export async function writeBucketsFile(buckets: ProductBucket[]): Promise<void> {
  await ensureStorageReady();
  await queueWrite(async () => {
    await writeJsonFile(BUCKETS_FILE, buckets);
  });
}
