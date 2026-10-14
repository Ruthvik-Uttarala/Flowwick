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
});
