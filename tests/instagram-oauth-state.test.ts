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
    insert: vi.fn().mockResolvedValue(result),
  };
}

describe("instagram oauth state persistence", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("uses delete-then-insert keyed by state for fresh persistence", async () => {
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

    const { saveInstagramOauthState } = await import("@/src/lib/server/instagram-oauth-state");
    await expect(
      saveInstagramOauthState({
        state: "ig-state-123",
        userId: "user-123",
        createdAt: "2026-04-07T10:00:00.000Z",
        expiresAt: "2026-04-07T10:10:00.000Z",
      })
    ).resolves.toBeUndefined();

    expect(insertQuery.insert).toHaveBeenCalledWith({
      state: "ig-state-123",
      user_id: "user-123",
      created_at: "2026-04-07T10:00:00.000Z",
      expires_at: "2026-04-07T10:10:00.000Z",
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

    const { saveInstagramOauthState } = await import("@/src/lib/server/instagram-oauth-state");
    await expect(
      saveInstagramOauthState({
        state: "ig-state-456",
        userId: "user-456",
        createdAt: "2026-04-07T10:00:00.000Z",
        expiresAt: "2026-04-07T10:10:00.000Z",
      })
    ).resolves.toBeUndefined();

    expect(insertQuery.insert).toHaveBeenCalledOnce();
  });

  it("sanitizes persistence failures when user cleanup fails", async () => {
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

    const { saveInstagramOauthState, InstagramOauthStatePersistenceError } = await import(
      "@/src/lib/server/instagram-oauth-state"
    );
    await expect(
      saveInstagramOauthState({
        state: "ig-state-789",
        userId: "user-789",
        createdAt: "2026-04-07T10:00:00.000Z",
        expiresAt: "2026-04-07T10:10:00.000Z",
      })
    ).rejects.toBeInstanceOf(InstagramOauthStatePersistenceError);
  });

  it("looks up and deletes state rows by state", async () => {
    const { getSupabaseAdmin } = await import("@/src/lib/server/supabase-admin");
    const selectMaybeSingle = vi.fn().mockResolvedValue({
      data: {
        state: "ig-state-lookup",
        user_id: "user-123",
        created_at: "2026-04-07T10:00:00.000Z",
        expires_at: "2026-04-07T10:10:00.000Z",
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

    const { deleteInstagramOauthState, getInstagramOauthState } = await import(
      "@/src/lib/server/instagram-oauth-state"
    );

    await expect(getInstagramOauthState("ig-state-lookup")).resolves.toMatchObject({
      state: "ig-state-lookup",
      user_id: "user-123",
    });
    await expect(deleteInstagramOauthState("ig-state-lookup")).resolves.toBeUndefined();
    expect(deleteEq).toHaveBeenCalledWith("state", "ig-state-lookup");
  });
});
