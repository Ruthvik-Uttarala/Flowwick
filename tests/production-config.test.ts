import { spawnSync } from "node:child_process";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  formatConfigReport,
  validateProductionConfig,
} from "@/src/lib/server/production-config.mjs";

const validProductionEnvironment = {
  NEXT_PUBLIC_SUPABASE_URL: "https://abcdefghijklmnopqrst.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key-value",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-key-value",
  NEXT_PUBLIC_APP_URL: "https://app.flowwick.test",
  OPENAI_API_KEY: "openai-key-value",
  SHOPIFY_CLIENT_ID: "shopify-client-id",
  SHOPIFY_CLIENT_SECRET: "shopify-client-secret",
  INSTAGRAM_ENABLED: "true",
  META_APP_ID: "meta-app-id",
  META_APP_SECRET: "meta-app-secret",
  META_TOKEN_ENCRYPTION_KEY: "meta-encryption-key",
};

function validate(overrides: Record<string, string | undefined> = {}) {
  return validateProductionConfig(
    { ...validProductionEnvironment, ...overrides },
    { mode: "production" },
  );
}

function errorNames(overrides: Record<string, string | undefined>) {
  return validate(overrides).errors.map((error: { name: string }) => error.name);
}

describe("production configuration validation", () => {
  it("accepts a fully valid production configuration", () => {
    expect(validate()).toMatchObject({ valid: true, errors: [] });
  });

  it("requires the Supabase anon key even when a publishable key is present", () => {
    expect(
      errorNames({
        NEXT_PUBLIC_SUPABASE_ANON_KEY: undefined,
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "publishable-key",
      }),
    ).toContain("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  });

  it.each([
    ["NEXT_PUBLIC_SUPABASE_URL", "missing Supabase URL"],
    ["SUPABASE_SERVICE_ROLE_KEY", "missing service role credential"],
    ["OPENAI_API_KEY", "missing OpenAI configuration"],
  ])("rejects %s (%s)", (name) => {
    expect(errorNames({ [name]: undefined })).toContain(name);
  });

  it("rejects an invalid Supabase URL", () => {
    expect(errorNames({ NEXT_PUBLIC_SUPABASE_URL: "https://supabase.invalid" })).toContain(
      "NEXT_PUBLIC_SUPABASE_URL",
    );
  });

  it.each([
    "http://flowwick.test",
    "https://localhost:3000",
    "https://127.0.0.1",
    "https://flowwick.test:8443",
    "https://flowwick.test/callback",
    "https://flowwick.test?preview=true",
    "https://flowwick.test#fragment",
  ])("rejects non-canonical production app URL %s", (appUrl) => {
    expect(errorNames({ NEXT_PUBLIC_APP_URL: appUrl })).toContain("NEXT_PUBLIC_APP_URL");
  });

  it("retains local HTTP origins in development mode", () => {
    const result = validateProductionConfig(
      { ...validProductionEnvironment, NEXT_PUBLIC_APP_URL: "http://localhost:3000" },
      { mode: "development" },
    );
    expect(result.valid).toBe(true);
  });

  it.each(["", "   ", "your-api-key", "replace-with-a-secret", "<secret>", "sk-..."])(
    "rejects empty or placeholder values without echoing them: %j",
    (sentinel) => {
      const result = validate({ OPENAI_API_KEY: sentinel });
      expect(result.valid).toBe(false);
      expect(JSON.stringify(result)).not.toContain(sentinel.trim() || "sentinel-not-present");
      expect(formatConfigReport(result)).not.toContain(sentinel.trim() || "sentinel-not-present");
    },
  );

  it("requires Meta configuration when Instagram is enabled", () => {
    const names = errorNames({ META_APP_ID: undefined, META_APP_SECRET: undefined });
    expect(names).toEqual(expect.arrayContaining(["META_APP_ID", "META_APP_SECRET"]));
  });

  it("skips Meta requirements when Instagram is explicitly disabled", () => {
    const result = validate({
      INSTAGRAM_ENABLED: "false",
      META_APP_ID: undefined,
      META_APP_SECRET: undefined,
      META_TOKEN_ENCRYPTION_KEY: undefined,
    });
    expect(result.valid).toBe(true);
  });

  it("does not require a global merchant-specific Shopify store domain", () => {
    expect(validate({ SHOPIFY_STORE_DOMAIN: undefined }).valid).toBe(true);
  });
});

describe("configuration checker CLI", () => {
  const script = path.resolve(process.cwd(), "scripts/check-config.mjs");

  function run(environment: Record<string, string>) {
    return spawnSync(process.execPath, [script, "--mode=production"], {
      encoding: "utf8",
      env: environment as NodeJS.ProcessEnv,
    });
  }

  it("returns zero for valid configuration", () => {
    const result = run(validProductionEnvironment);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Configuration check passed");
    expect(result.stderr).toBe("");
  });

  it("returns nonzero for invalid configuration without exposing sentinel values", () => {
    const sentinel = "SENTINEL_SECRET_MUST_NOT_LEAK";
    const result = run({ ...validProductionEnvironment, OPENAI_API_KEY: sentinel, META_APP_SECRET: "" });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("META_APP_SECRET");
    expect(`${result.stdout}${result.stderr}`).not.toContain(sentinel);
  });
});
