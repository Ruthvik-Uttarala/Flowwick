import fs from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  acquireSubmissionLock,
  parsePasswordRecoveryLocation,
  validateNewPassword,
} from "@/src/lib/auth/password-recovery";

function jsonResponse(status: number, body: unknown) {
  return new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: status === 204 ? undefined : { "content-type": "application/json" },
  });
}

describe("password recovery link handling", () => {
  it("accepts the default Supabase recovery fragment", () => {
    expect(
      parsePasswordRecoveryLocation(
        "https://flowwick.vercel.app/auth/update-password#access_token=recovery-jwt&type=recovery&refresh_token=ignored",
      ),
    ).toEqual({ credential: { kind: "access_token", value: "recovery-jwt" } });
  });

  it("accepts a token-hash recovery template without requiring it", () => {
    expect(
      parsePasswordRecoveryLocation(
        "https://flowwick.vercel.app/auth/update-password?token_hash=hashed-token&type=recovery",
      ),
    ).toEqual({ credential: { kind: "token_hash", value: "hashed-token" } });
  });

  it("classifies expired, reused, and malformed links safely", () => {
    expect(
      parsePasswordRecoveryLocation(
        "https://flowwick.vercel.app/auth/update-password#error=access_denied&error_code=otp_expired&error_description=expired",
      ),
    ).toEqual({ error: "expired" });
    expect(parsePasswordRecoveryLocation("https://flowwick.vercel.app/auth/update-password")).toEqual({
      error: "invalid",
    });
    expect(parsePasswordRecoveryLocation("not a url")).toEqual({ error: "invalid" });
  });

  it("rejects password mismatch and short passwords", () => {
    expect(validateNewPassword("long-enough", "different-one")).toBe("Passwords do not match.");
    expect(validateNewPassword("short", "short")).toContain("at least 8");
    expect(validateNewPassword("long-enough", "long-enough")).toBe("");
  });

  it("prevents duplicate submissions until the caller releases the lock", () => {
    const lock = { current: false };
    expect(acquireSubmissionLock(lock)).toBe(true);
    expect(acquireSubmissionLock(lock)).toBe(false);
    lock.current = false;
    expect(acquireSubmissionLock(lock)).toBe(true);
  });
});

describe("Supabase recovery password update", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "public-anon-key");
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("verifies the recovery user, updates with that token, and revokes the session", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, { id: "user-1", email: "person@example.com" }))
      .mockResolvedValueOnce(jsonResponse(200, { id: "user-1", email: "person@example.com" }))
      .mockResolvedValueOnce(jsonResponse(204, null));
    vi.stubGlobal("fetch", fetchMock);

    const { updatePasswordWithRecovery } = await import("@/src/lib/supabase/server");
    await expect(
      updatePasswordWithRecovery({ accessToken: "recovery-access-token", password: "new-password-123" }),
    ).resolves.toEqual({ updated: true });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    const updateCall = fetchMock.mock.calls[1];
    expect(updateCall[0]).toBe("https://project.supabase.co/auth/v1/user");
    expect(updateCall[1].method).toBe("PUT");
    expect(new Headers(updateCall[1].headers).get("authorization")).toBe("Bearer recovery-access-token");
    expect(updateCall[1].body).toBe(JSON.stringify({ password: "new-password-123" }));
    expect(JSON.stringify(fetchMock.mock.calls)).not.toContain("service_role");
  });

  it("exchanges token_hash before updating the password", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(200, { access_token: "verified-access-token", refresh_token: "temporary" }),
      )
      .mockResolvedValueOnce(jsonResponse(200, { id: "user-1" }))
      .mockResolvedValueOnce(jsonResponse(200, { id: "user-1" }))
      .mockResolvedValueOnce(jsonResponse(204, null));
    vi.stubGlobal("fetch", fetchMock);

    const { updatePasswordWithRecovery } = await import("@/src/lib/supabase/server");
    await expect(
      updatePasswordWithRecovery({ tokenHash: "recovery-hash", password: "new-password-123" }),
    ).resolves.toEqual({ updated: true });
    expect(fetchMock.mock.calls[0][0]).toBe("https://project.supabase.co/auth/v1/verify");
    expect(fetchMock.mock.calls[0][1].body).toBe(
      JSON.stringify({ token_hash: "recovery-hash", type: "recovery" }),
    );
  });

  it("does not attempt an unauthorized password update", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse(401, { message: "JWT expired" }));
    vi.stubGlobal("fetch", fetchMock);

    const { updatePasswordWithRecovery } = await import("@/src/lib/supabase/server");
    await expect(
      updatePasswordWithRecovery({ accessToken: "expired-token", password: "new-password-123" }),
    ).resolves.toEqual({ updated: false, errorCode: "invalid_recovery_link" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("password recovery routing contract", () => {
  it("provides the update route, secure fields, URL cleanup, and reset-again action", () => {
    const root = process.cwd();
    const page = fs.readFileSync(path.join(root, "app/auth/update-password/page.tsx"), "utf8");
    const view = fs.readFileSync(path.join(root, "src/components/UpdatePasswordView.tsx"), "utf8");
    expect(page).toContain("UpdatePasswordView");
    expect(view).toContain("New Password");
    expect(view).toContain("Confirm Password");
    expect(view).toContain("Password updated successfully");
    expect(view).toContain('replaceState(null, "", "/auth/update-password")');
    expect(view).toContain('href="/auth?mode=reset"');
    expect(view).toContain('href="/auth"');
  });
});
