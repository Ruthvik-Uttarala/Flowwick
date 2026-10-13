const BASE_REQUIRED_VARIABLES = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "NEXT_PUBLIC_APP_URL",
  "OPENAI_API_KEY",
  "SHOPIFY_CLIENT_ID",
  "SHOPIFY_CLIENT_SECRET",
];

const INSTAGRAM_REQUIRED_VARIABLES = [
  "META_APP_ID",
  "META_APP_SECRET",
  "META_TOKEN_ENCRYPTION_KEY",
];

const PLACEHOLDER_PATTERNS = [
  /^(?:changeme|placeholder|todo|tbd|xxx+)$/i,
  /^(?:your|replace)[-_ ]/i,
  /(?:^|[-_. ])example(?:$|[-_. ])/i,
  /<[^>]+>/,
  /\.{3}/,
];

function valueFor(environment, name) {
  const value = environment[name];
  return typeof value === "string" ? value.trim() : "";
}

function isPlaceholder(value) {
  return PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(value));
}

function parseInstagramEnabled(environment) {
  const rawValue = valueFor(environment, "INSTAGRAM_ENABLED");
  if (!rawValue) return { enabled: true };

  const normalized = rawValue.toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return { enabled: true };
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return { enabled: false };
  }

  return {
    enabled: true,
    error: {
      name: "INSTAGRAM_ENABLED",
      reason: "must be an explicit boolean value",
    },
  };
}

function validateSupabaseUrl(value) {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      /^[a-z0-9-]+\.supabase\.co$/i.test(url.hostname) &&
      url.username === "" &&
      url.password === "" &&
      url.port === "" &&
      (url.pathname === "" || url.pathname === "/") &&
      url.search === "" &&
      url.hash === ""
    );
  } catch {
    return false;
  }
}

function isLoopbackHostname(hostname) {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  return (
    normalized === "localhost" ||
    normalized === "::1" ||
    normalized === "0.0.0.0" ||
    normalized.startsWith("127.")
  );
}

function validateAppUrl(value, mode) {
  try {
    const url = new URL(value);
    const isCanonicalOrigin =
      url.username === "" &&
      url.password === "" &&
      (url.pathname === "" || url.pathname === "/") &&
      url.search === "" &&
      url.hash === "";

    if (!isCanonicalOrigin) return false;
    if (mode === "production") {
      return (
        url.protocol === "https:" &&
        url.port === "" &&
        !isLoopbackHostname(url.hostname)
      );
    }

    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

/**
 * @param {Record<string, string | undefined>} [environment]
 * @param {{ mode?: "production" | "development" }} [options]
 */
export function resolveApplicationOrigin(environment = process.env, options = {}) {
  const mode =
    options.mode ??
    (environment.NODE_ENV === "production" ? "production" : "development");
  const configuredValue = valueFor(environment, "NEXT_PUBLIC_APP_URL");
  const value =
    configuredValue || (mode === "development" ? "http://localhost:3000" : "");

  if (!value) {
    throw new Error("NEXT_PUBLIC_APP_URL is required for production OAuth.");
  }
  if ((mode === "production" && isPlaceholder(value)) || !validateAppUrl(value, mode)) {
    throw new Error(
      mode === "production"
        ? "NEXT_PUBLIC_APP_URL must be a canonical HTTPS origin without localhost, a path, query, fragment, or custom port."
        : "NEXT_PUBLIC_APP_URL must be a canonical HTTP(S) origin.",
    );
  }

  return new URL(value).origin;
}

function addRequiredValueError(errors, environment, name) {
  const value = valueFor(environment, name);
  if (!value) {
    errors.push({ name, reason: "is required" });
  } else if (isPlaceholder(value)) {
    errors.push({ name, reason: "contains a placeholder value" });
  }
}

export function validateProductionConfig(environment, options = {}) {
  const mode = options.mode ?? "production";
  if (mode !== "production" && mode !== "development") {
    throw new TypeError("Configuration mode must be production or development.");
  }

  const errors = [];
  const instagram = parseInstagramEnabled(environment);
  if (instagram.error) errors.push(instagram.error);

  const requiredVariables = instagram.enabled
    ? [...BASE_REQUIRED_VARIABLES, ...INSTAGRAM_REQUIRED_VARIABLES]
    : BASE_REQUIRED_VARIABLES;

  for (const name of requiredVariables) {
    addRequiredValueError(errors, environment, name);
  }

  const supabaseUrl = valueFor(environment, "NEXT_PUBLIC_SUPABASE_URL");
  if (
    supabaseUrl &&
    !isPlaceholder(supabaseUrl) &&
    !validateSupabaseUrl(supabaseUrl)
  ) {
    errors.push({
      name: "NEXT_PUBLIC_SUPABASE_URL",
      reason: "must be a Supabase HTTPS origin",
    });
  }

  const appUrl = valueFor(environment, "NEXT_PUBLIC_APP_URL");
  if (appUrl && !isPlaceholder(appUrl) && !validateAppUrl(appUrl, mode)) {
    errors.push({
      name: "NEXT_PUBLIC_APP_URL",
      reason:
        mode === "production"
          ? "must be a canonical, non-loopback HTTPS origin"
          : "must be a canonical HTTP(S) origin",
    });
  }

  return {
    valid: errors.length === 0,
    mode,
    errors,
    checkedVariables: requiredVariables,
  };
}

export function formatConfigReport(result) {
  if (result.valid) {
    return [
      `Configuration check passed (${result.mode}).`,
      ...result.checkedVariables.map((name) => `PASS ${name}`),
    ].join("\n");
  }

  return [
    `Configuration check failed (${result.mode}).`,
    ...result.errors.map(({ name, reason }) => `FAIL ${name}: ${reason}`),
  ].join("\n");
}
