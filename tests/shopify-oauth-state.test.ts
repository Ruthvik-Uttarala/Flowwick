import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/src/lib/server/supabase-admin", () => ({
  getSupabaseAdmin: vi.fn(),
}));

type QueryResult = { error: { message: string } | null; data?: unknown };

function createDeleteLtQuery(result: QueryResult) {
  return {
    delete: vi.fn(() => ({
      lt: vi.fn().mockResolvedValue(result),
    })),
  };
}

function createDeleteEqQuery(result: QueryResult) {
  return {
    delete: vi.fn(() => ({
      eq: vi.fn().mockResolvedValue(result),
    })),
  };
}

function createInsertQuery(result: QueryResult) {
  return {
    upsert: vi.fn(),
    insert: vi.fn().mockResolvedValue(result),
  };
}

describe("shopify oauth state persistence", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("uses delete-then-insert so drifted tables do not depend on state on-conflict constraints", async () => {
    const { getSupabaseAdmin } = await import("@/src/lib/server/supabase-admin");
    const expiredCleanup = createDeleteLtQuery({ error: null });
    const priorUserCleanup = createDeleteEqQuery({ error: null });
    const insertQuery = createInsertQuery({ error: null });

    let callCount = 0;
    vi.mocked(getSupabaseAdmin).mockReturnValue({
      from: vi.fn(() => {
        callCount += 1;
        if (callCount === 1) return expiredCleanup;
        if (callCount === 2) return priorUserCleanup;
        return insertQuery;
      }),
    } as never);

    const { saveShopifyOauthState } = await import("@/src/lib/server/shopify-oauth-state");
    await expect(
      saveShopifyOauthState({
        state: "state-123",
        userId: "user-123",
        shopDomain: "demo.myshopify.com",
        createdAt: "2026-04-05T10:00:00.000Z",
        expiresAt: "2026-04-05T10:10:00.000Z",
      })
    ).resolves.toBeUndefined();

    expect(insertQuery.upsert).not.toHaveBeenCalled();
    expect(insertQuery.insert).toHaveBeenCalledWith({
      state: "state-123",
      user_id: "user-123",
      shop_domain: "demo.myshopify.com",
      created_at: "2026-04-05T10:00:00.000Z",
      expires_at: "2026-04-05T10:10:00.000Z",
    });
  });

  it("ignores expired cleanup failures but still persists a fresh state", async () => {
    const { getSupabaseAdmin } = await import("@/src/lib/server/supabase-admin");
    const expiredCleanup = createDeleteLtQuery({ error: { message: "cleanup failed" } });
    const priorUserCleanup = createDeleteEqQuery({ error: null });
    const insertQuery = createInsertQuery({ error: null });

    let callCount = 0;
    vi.mocked(getSupabaseAdmin).mockReturnValue({
      from: vi.fn(() => {
        callCount += 1;
        if (callCount === 1) return expiredCleanup;
        if (callCount === 2) return priorUserCleanup;
        return insertQuery;
      }),
    } as never);

    const { saveShopifyOauthState } = await import("@/src/lib/server/shopify-oauth-state");
    await expect(
      saveShopifyOauthState({
        state: "state-456",
        userId: "user-456",
        shopDomain: "demo.myshopify.com",
        createdAt: "2026-04-05T10:00:00.000Z",
        expiresAt: "2026-04-05T10:10:00.000Z",
      })
    ).resolves.toBeUndefined();

    expect(insertQuery.insert).toHaveBeenCalledOnce();
  });

  it("returns a sanitized persistence error when user cleanup fails under legacy user_id uniqueness", async () => {
    const { getSupabaseAdmin } = await import("@/src/lib/server/supabase-admin");
    const expiredCleanup = createDeleteLtQuery({ error: null });
    const priorUserCleanup = createDeleteEqQuery({ error: { message: "duplicate key" } });

    let callCount = 0;
    vi.mocked(getSupabaseAdmin).mockReturnValue({
      from: vi.fn(() => {
        callCount += 1;
        return callCount === 1 ? expiredCleanup : priorUserCleanup;
      }),
    } as never);

    const { saveShopifyOauthState, ShopifyOauthStatePersistenceError } = await import(
      "@/src/lib/server/shopify-oauth-state"
    );
    await expect(
      saveShopifyOauthState({
        state: "state-789",
        userId: "user-789",
        shopDomain: "demo.myshopify.com",
        createdAt: "2026-04-05T10:00:00.000Z",
        expiresAt: "2026-04-05T10:10:00.000Z",
      })
    ).rejects.toBeInstanceOf(ShopifyOauthStatePersistenceError);
  });

  it("returns a sanitized persistence error when insert fails", async () => {
    const { getSupabaseAdmin } = await import("@/src/lib/server/supabase-admin");
    const expiredCleanup = createDeleteLtQuery({ error: null });
    const priorUserCleanup = createDeleteEqQuery({ error: null });
    const insertQuery = createInsertQuery({ error: { message: "there is no unique constraint" } });

    let callCount = 0;
    vi.mocked(getSupabaseAdmin).mockReturnValue({
      from: vi.fn(() => {
        callCount += 1;
        if (callCount === 1) return expiredCleanup;
        if (callCount === 2) return priorUserCleanup;
        return insertQuery;
      }),
    } as never);

    const { saveShopifyOauthState, ShopifyOauthStatePersistenceError } = await import(
      "@/src/lib/server/shopify-oauth-state"
    );
    await expect(
      saveShopifyOauthState({
        state: "state-999",
        userId: "user-999",
        shopDomain: "demo.myshopify.com",
        createdAt: "2026-04-05T10:00:00.000Z",
        expiresAt: "2026-04-05T10:10:00.000Z",
      })
    ).rejects.toBeInstanceOf(ShopifyOauthStatePersistenceError);
  });

  it("looks up and deletes oauth state rows by state", async () => {
    const { getSupabaseAdmin } = await import("@/src/lib/server/supabase-admin");
    const selectMaybeSingle = vi.fn().mockResolvedValue({
      data: {
        state: "state-lookup",
        user_id: "user-123",
        shop_domain: "demo.myshopify.com",
        created_at: "2026-04-05T10:00:00.000Z",
        expires_at: "2026-04-05T10:10:00.000Z",
      },
      error: null,
    });
    const deleteEq = vi.fn().mockResolvedValue({ error: null });

    let callCount = 0;
    vi.mocked(getSupabaseAdmin).mockReturnValue({
      from: vi.fn(() => {
        callCount += 1;
        if (callCount === 1) {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: selectMaybeSingle,
              })),
            })),
          };
        }

        return {
          delete: vi.fn(() => ({
            eq: deleteEq,
          })),
        };
      }),
    } as never);

    const { getShopifyOauthState, deleteShopifyOauthState } = await import(
      "@/src/lib/server/shopify-oauth-state"
    );

    await expect(getShopifyOauthState("state-lookup")).resolves.toMatchObject({
      state: "state-lookup",
      user_id: "user-123",
    });
    await expect(deleteShopifyOauthState("state-lookup")).resolves.toBeUndefined();
    expect(deleteEq).toHaveBeenCalledWith("state", "state-lookup");
  });
});
