import {
  SUPABASE_ACCESS_COOKIE,
  SUPABASE_REFRESH_COOKIE,
  type AuthCredentials,
  type SupabaseAuthErrorShape,
  type SupabaseAuthSession,
  type SupabaseUser,
} from "@/src/lib/supabase/types";
import {
  isSupabaseEnvConfigured,
  supabaseConfigError,
  supabasePublicEnv,
} from "@/src/lib/supabase/env";

const authBaseUrl = supabasePublicEnv.url;
const anonKey = supabasePublicEnv.anonKey;

export const supabaseAuthConfigured = isSupabaseEnvConfigured;

function authHeaders(extraHeaders?: HeadersInit): Headers {
  const headers = new Headers(extraHeaders);
  headers.set("apikey", anonKey);
  if (!headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${anonKey}`);
  }
  headers.set("Content-Type", "application/json");
  return headers;
}

function authUrl(path: string): string {
  return `${authBaseUrl.replace(/\/$/, "")}/auth/v1${path}`;
}

function parseAuthError(body: SupabaseAuthErrorShape | null | undefined): string {
  return body?.message ?? body?.msg ?? body?.error ?? "Authentication request failed.";
}

async function supabaseAuthRequest<T>(
  path: string,
  init?: RequestInit,
): Promise<{ data?: T; error?: string }> {
  if (!supabaseAuthConfigured) {
    console.error("[merchflow:supabase] Auth not configured:", supabaseConfigError);
    return { error: supabaseConfigError };
  }

  const url = authUrl(path);
  console.log("[merchflow:supabase] Request:", init?.method ?? "GET", url);

  const response = await fetch(url, {
    ...init,
    headers: authHeaders(init?.headers),
    cache: "no-store",
  });

  const contentType = response.headers.get("content-type") ?? "";
  const payload = contentType.includes("application/json")
    ? ((await response.json().catch(() => null)) as T | SupabaseAuthErrorShape | null)
    : null;

  console.log("[merchflow:supabase] Response status:", response.status, "path:", path);

  if (!response.ok) {
    const errorMsg = parseAuthError(payload as SupabaseAuthErrorShape | null);
    console.error("[merchflow:supabase] Auth error:", errorMsg, "payload:", JSON.stringify(payload));
    return { error: errorMsg };
  }

  return { data: payload as T };
}

export function buildSessionCookieOptions(maxAgeSeconds: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: maxAgeSeconds,
  };
}

export function buildClearCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: 0,
  };
}

export async function signUpWithSupabase(credentials: AuthCredentials): Promise<{
  session?: SupabaseAuthSession | null;
  error?: string;
}> {
  const result = await supabaseAuthRequest<SupabaseAuthSession | { user: SupabaseUser | null }>(
    "/signup",
    {
      method: "POST",
      body: JSON.stringify({
        email: credentials.email,
        password: credentials.password,
      }),
    },
  );

  if (result.error) {
    return { error: result.error };
  }

  const payload = result.data as SupabaseAuthSession | { user: SupabaseUser | null } | undefined;
  if (payload && "access_token" in payload && "refresh_token" in payload) {
    return { session: payload };
  }

  return { session: null };
}

export async function signInWithSupabase(credentials: AuthCredentials): Promise<{
  session?: SupabaseAuthSession;
  error?: string;
}> {
  const result = await supabaseAuthRequest<SupabaseAuthSession>("/token?grant_type=password", {
    method: "POST",
    body: JSON.stringify({
      email: credentials.email,
      password: credentials.password,
    }),
  });

  if (result.error) {
    return { error: result.error };
  }

  return { session: result.data };
}

export async function refreshSupabaseSession(refreshToken: string): Promise<{
  session?: SupabaseAuthSession;
  error?: string;
}> {
  const result = await supabaseAuthRequest<SupabaseAuthSession>("/token?grant_type=refresh_token", {
    method: "POST",
    body: JSON.stringify({ refresh_token: refreshToken }),
  });

  if (result.error) {
    return { error: result.error };
  }

  return { session: result.data };
}

export async function getSupabaseUser(accessToken: string): Promise<{
  user?: SupabaseUser;
  error?: string;
}> {
  const result = await supabaseAuthRequest<SupabaseUser>("/user", {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (result.error) {
    return { error: result.error };
  }

  return { user: result.data };
}

export async function updatePasswordWithRecovery(input: {
  password: string;
  accessToken?: string;
  tokenHash?: string;
}): Promise<{
  updated: boolean;
  errorCode?: "invalid_recovery_link" | "password_rejected";
}> {
  let accessToken = input.accessToken?.trim() ?? "";

  if (!accessToken && input.tokenHash?.trim()) {
    const verification = await supabaseAuthRequest<SupabaseAuthSession>("/verify", {
      method: "POST",
      body: JSON.stringify({
        token_hash: input.tokenHash.trim(),
        type: "recovery",
      }),
    });
    accessToken = verification.data?.access_token?.trim() ?? "";
    if (!accessToken) {
      return { updated: false, errorCode: "invalid_recovery_link" };
    }
  }

  if (!accessToken) {
    return { updated: false, errorCode: "invalid_recovery_link" };
  }

  const verifiedUser = await getSupabaseUser(accessToken);
  if (!verifiedUser.user) {
    return { updated: false, errorCode: "invalid_recovery_link" };
  }

  const update = await supabaseAuthRequest<SupabaseUser>("/user", {
    method: "PUT",
    headers: { Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ password: input.password }),
  });

  if (!update.data || update.error) {
    return { updated: false, errorCode: "password_rejected" };
  }

  // Best-effort revocation: the user must sign in again after recovery.
  await supabaseAuthRequest<unknown>("/logout", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  return { updated: true };
}

export function serializeSessionCookies(session: SupabaseAuthSession): Array<{
  name: string;
  value: string;
  options: ReturnType<typeof buildSessionCookieOptions>;
}> {
  return [
    {
      name: SUPABASE_ACCESS_COOKIE,
      value: session.access_token,
      options: buildSessionCookieOptions(session.expires_in),
    },
    {
      name: SUPABASE_REFRESH_COOKIE,
      value: session.refresh_token,
      options: buildSessionCookieOptions(60 * 60 * 24 * 30),
    },
  ];
}
