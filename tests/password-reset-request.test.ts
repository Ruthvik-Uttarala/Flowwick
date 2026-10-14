import { beforeEach, describe, expect, it, vi } from "vitest";

describe("password reset request route", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "public-anon-key");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://flowwick.vercel.app");
  });

  it("sends the canonical update-password redirect to Supabase", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const { POST } = await import("@/app/api/auth/reset-password/route");

    const response = await POST(
      new Request("https://untrusted-preview.vercel.app/api/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({ email: "person@example.com" }),
      }),
    );

    expect(response.status).toBe(200);
    const recoveryUrl = new URL(String(fetchMock.mock.calls[0][0]));
    expect(recoveryUrl.origin + recoveryUrl.pathname).toBe(
      "https://project.supabase.co/auth/v1/recover",
    );
    expect(recoveryUrl.searchParams.get("redirect_to")).toBe(
      "https://flowwick.vercel.app/auth/update-password",
    );
    expect(String(fetchMock.mock.calls[0][0])).not.toContain("untrusted-preview");
  });

  it("fails safely when the production origin is missing", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { POST } = await import("@/app/api/auth/reset-password/route");
    const response = await POST(
      new Request("https://flowwick.vercel.app/api/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({ email: "person@example.com" }),
      }),
    );
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("public-anon-key");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects an insecure production redirect without trusting the request host", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://flowwick.vercel.app");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { POST } = await import("@/app/api/auth/reset-password/route");
    const response = await POST(
      new Request("https://attacker.example/api/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({ email: "person@example.com" }),
      }),
    );
    expect(response.status).toBe(503);
    expect(await response.text()).toContain("temporarily unavailable");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not expose Supabase provider errors or configuration values", async () => {
    const sentinel = "SENSITIVE_PROVIDER_DETAIL";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ message: sentinel }), {
          status: 500,
          headers: { "content-type": "application/json" },
        }),
      ),
    );
    const { POST } = await import("@/app/api/auth/reset-password/route");
    const response = await POST(
      new Request("https://flowwick.vercel.app/api/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({ email: "person@example.com" }),
      }),
    );
    const body = await response.text();
    expect(response.status).toBe(200);
    expect(body).toContain("If this email has an account");
    expect(body).not.toContain(sentinel);
    expect(body).not.toContain("public-anon-key");
  });
});
