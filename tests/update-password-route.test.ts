import { beforeEach, describe, expect, it, vi } from "vitest";

const updatePasswordWithRecovery = vi.fn();

vi.mock("@/src/lib/supabase/server", () => ({
  supabaseAuthConfigured: true,
  updatePasswordWithRecovery,
  buildClearCookieOptions: () => ({
    httpOnly: true,
    secure: true,
    sameSite: "lax" as const,
    path: "/",
    maxAge: 0,
  }),
}));

describe("update password API", () => {
  beforeEach(() => updatePasswordWithRecovery.mockReset());

  it("returns success and clears any existing application session", async () => {
    updatePasswordWithRecovery.mockResolvedValue({ updated: true });
    const { POST } = await import("@/app/api/auth/update-password/route");
    const response = await POST(
      new Request("https://flowwick.vercel.app/api/auth/update-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password: "new-password-123", accessToken: "recovery-token" }),
      }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      ok: true,
      data: { message: "Password updated successfully" },
    });
    const cookies = response.headers.get("set-cookie") ?? "";
    expect(cookies).toContain("flowcart-sb-access=");
    expect(cookies).toContain("flowcart-sb-refresh=");
    expect(cookies).toContain("Max-Age=0");
  });

  it("rejects requests without a recovery credential", async () => {
    const { POST } = await import("@/app/api/auth/update-password/route");
    const response = await POST(
      new Request("https://flowwick.vercel.app/api/auth/update-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password: "new-password-123" }),
      }),
    );
    expect(response.status).toBe(400);
    expect(updatePasswordWithRecovery).not.toHaveBeenCalled();
  });

  it("maps expired or reused credentials to a safe response without echoing them", async () => {
    const sentinel = "SECRET-RECOVERY-TOKEN";
    updatePasswordWithRecovery.mockResolvedValue({
      updated: false,
      errorCode: "invalid_recovery_link",
    });
    const { POST } = await import("@/app/api/auth/update-password/route");
    const response = await POST(
      new Request("https://flowwick.vercel.app/api/auth/update-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password: "new-password-123", accessToken: sentinel }),
      }),
    );
    expect(response.status).toBe(401);
    const body = await response.text();
    expect(body).toContain("expired");
    expect(body).not.toContain(sentinel);
  });
});
