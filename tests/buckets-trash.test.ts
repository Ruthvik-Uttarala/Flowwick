import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DbBucketRow } from "@/src/lib/server/buckets";

vi.mock("@/src/lib/server/supabase-admin", () => ({
  getSupabaseAdmin: vi.fn(),
}));

function makeDbBucketRow(overrides: Partial<DbBucketRow> = {}): DbBucketRow {
  return {
    id: "bucket-1",
    user_id: "user-1",
    title_raw: "Raw title",
    description_raw: "Raw description",
    title_enhanced: "",
    description_enhanced: "",
    quantity: 2,
    price: 19.5,
    image_urls: ["https://cdn.example/img.jpg"],
    status: "FAILED",
    shopify_created: false,
    shopify_product_id: "",
    shopify_product_url: "",
    instagram_published: false,
    instagram_post_id: "",
    instagram_post_url: "",
    error_message: "failed",
    trashed_at: null,
    delete_after_at: null,
    created_at: "2026-04-20T10:00:00.000Z",
    updated_at: "2026-04-20T10:00:00.000Z",
    ...overrides,
  };
}

function createCleanupQuery(result: { error: { message: string } | null } = { error: null }) {
  const lte = vi.fn().mockResolvedValue(result);
  const notDeleteAfter = vi.fn(() => ({ lte }));
  const notTrashed = vi.fn(() => ({ not: notDeleteAfter }));
  const eq = vi.fn(() => ({ not: notTrashed }));
  const deleteFn = vi.fn(() => ({ eq }));

  return {
    query: { delete: deleteFn },
    spies: { deleteFn, eq, notTrashed, notDeleteAfter, lte },
  };
}

function createGetBucketQuery(row: DbBucketRow) {
  const single = vi.fn().mockResolvedValue({ data: row, error: null });
  const is = vi.fn(() => ({ single }));
  const eqUser = vi.fn(() => ({ is }));
  const eqId = vi.fn(() => ({ eq: eqUser }));
  const select = vi.fn(() => ({ eq: eqId }));

  return {
    query: { select },
    spies: { select, eqId, eqUser, is, single },
  };
}

function createGetBucketIncludeTrashedQuery(row: DbBucketRow) {
  const single = vi.fn().mockResolvedValue({ data: row, error: null });
  const eqUser = vi.fn(() => ({ single }));
  const eqId = vi.fn(() => ({ eq: eqUser }));
  const select = vi.fn(() => ({ eq: eqId }));

  return {
    query: { select },
    spies: { select, eqId, eqUser, single },
  };
}

function createUpdateWithIsQuery(row: DbBucketRow) {
  const single = vi.fn().mockResolvedValue({ data: row, error: null });
  const select = vi.fn(() => ({ single }));
  const is = vi.fn(() => ({ select }));
  const eqUser = vi.fn(() => ({ is }));
  const eqId = vi.fn(() => ({ eq: eqUser }));
  const update = vi.fn((payload: Record<string, unknown>) => {
    void payload;
    return { eq: eqId };
  });

  return {
    query: { update },
    spies: { update, eqId, eqUser, is, select, single },
  };
}

function createUpdateWithNotQuery(row: DbBucketRow) {
  const single = vi.fn().mockResolvedValue({ data: row, error: null });
  const select = vi.fn(() => ({ single }));
  const not = vi.fn(() => ({ select }));
  const eqUser = vi.fn(() => ({ not }));
  const eqId = vi.fn(() => ({ eq: eqUser }));
  const update = vi.fn((payload: Record<string, unknown>) => {
    void payload;
    return { eq: eqId };
  });

  return {
    query: { update },
    spies: { update, eqId, eqUser, not, select, single },
  };
}

function createSelectActiveBucketsQuery(rows: DbBucketRow[]) {
  const order = vi.fn().mockResolvedValue({ data: rows, error: null });
  const is = vi.fn(() => ({ order }));
  const eq = vi.fn(() => ({ is }));
  const select = vi.fn(() => ({ eq }));

  return {
    query: { select },
    spies: { select, eq, is, order },
  };
}

function createSelectTrashedBucketsQuery(rows: DbBucketRow[]) {
  const order = vi.fn().mockResolvedValue({ data: rows, error: null });
  const not = vi.fn(() => ({ order }));
  const eq = vi.fn(() => ({ not }));
  const select = vi.fn(() => ({ eq }));

  return {
    query: { select },
    spies: { select, eq, not, order },
  };
}

describe("bucket trash lifecycle server behavior", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("maps trashed and delete-after timestamps from DB rows", async () => {
    const { mapDbBucketRowToBucket } = await import("@/src/lib/server/buckets");

    const bucket = mapDbBucketRowToBucket(
      makeDbBucketRow({
        trashed_at: "2026-04-19T10:00:00.000Z",
        delete_after_at: "2026-05-19T10:00:00.000Z",
      })
    );

    expect(bucket.trashedAt).toBe("2026-04-19T10:00:00.000Z");
    expect(bucket.deleteAfterAt).toBe("2026-05-19T10:00:00.000Z");
    expect(bucket.status).toBe("FAILED");
  });

  it("moves failed buckets to trash with a 30-day retention window", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-20T12:00:00.000Z"));

    const { getSupabaseAdmin } = await import("@/src/lib/server/supabase-admin");
    const cleanup = createCleanupQuery();
    const cleanupDuringLookup = createCleanupQuery();
    const loadBucket = createGetBucketQuery(makeDbBucketRow());
    const updatedRow = makeDbBucketRow({
      trashed_at: "2026-04-20T12:00:00.000Z",
      delete_after_at: "2026-05-20T12:00:00.000Z",
    });
    const updateBucket = createUpdateWithIsQuery(updatedRow);

    let callCount = 0;
    vi.mocked(getSupabaseAdmin).mockReturnValue({
      from: vi.fn(() => {
        callCount += 1;
        if (callCount === 1) return cleanup.query;
        if (callCount === 2) return cleanupDuringLookup.query;
        if (callCount === 3) return loadBucket.query;
        return updateBucket.query;
      }),
    } as never);

    const { moveBucketToTrash } = await import("@/src/lib/server/buckets");
    const result = await moveBucketToTrash("bucket-1", "user-1");

    expect(result?.trashedAt).toBe("2026-04-20T12:00:00.000Z");
    expect(result?.deleteAfterAt).toBe("2026-05-20T12:00:00.000Z");
    expect(updateBucket.spies.eqUser).toHaveBeenCalledWith("user_id", "user-1");

    expect(updateBucket.spies.update).toHaveBeenCalled();
    const updatePayload = updateBucket.spies.update.mock.calls.at(0)?.[0] as
      | {
          trashed_at: string;
          delete_after_at: string;
        }
      | undefined;
    expect(updatePayload).toBeDefined();
    expect(updatePayload).toMatchObject({
      trashed_at: expect.any(String),
      delete_after_at: expect.any(String),
    });
    expect(updatePayload?.trashed_at).toBe("2026-04-20T12:00:00.000Z");
    expect(updatePayload?.delete_after_at).toBe("2026-05-20T12:00:00.000Z");

    vi.useRealTimers();
  });

  it("restores trashed buckets by clearing lifecycle timestamps", async () => {
    const { getSupabaseAdmin } = await import("@/src/lib/server/supabase-admin");
    const cleanup = createCleanupQuery();
    const cleanupDuringLookup = createCleanupQuery();
    const loadBucket = createGetBucketIncludeTrashedQuery(
      makeDbBucketRow({
        trashed_at: "2026-04-20T12:00:00.000Z",
        delete_after_at: "2026-05-20T12:00:00.000Z",
      })
    );
    const restoredRow = makeDbBucketRow({
      trashed_at: null,
      delete_after_at: null,
    });
    const updateBucket = createUpdateWithNotQuery(restoredRow);

    let callCount = 0;
    vi.mocked(getSupabaseAdmin).mockReturnValue({
      from: vi.fn(() => {
        callCount += 1;
        if (callCount === 1) return cleanup.query;
        if (callCount === 2) return cleanupDuringLookup.query;
        if (callCount === 3) return loadBucket.query;
        return updateBucket.query;
      }),
    } as never);

    const { restoreBucketFromTrash } = await import("@/src/lib/server/buckets");
    const result = await restoreBucketFromTrash("bucket-1", "user-1");

    expect(result?.trashedAt).toBe("");
    expect(result?.deleteAfterAt).toBe("");

    expect(updateBucket.spies.update).toHaveBeenCalled();
    const updatePayload = updateBucket.spies.update.mock.calls.at(0)?.[0] as
      | {
          trashed_at: null;
          delete_after_at: null;
        }
      | undefined;
    expect(updatePayload).toBeDefined();
    expect(updatePayload).toMatchObject({
      trashed_at: null,
      delete_after_at: null,
    });
    expect(updateBucket.spies.eqUser).toHaveBeenCalledWith("user_id", "user-1");
  });

  it("permanently deletes a bucket only inside the requesting user's scope", async () => {
    const { getSupabaseAdmin } = await import("@/src/lib/server/supabase-admin");
    const cleanup = createCleanupQuery();
    const eqUser = vi.fn().mockResolvedValue({ error: null, count: 1 });
    const eqId = vi.fn(() => ({ eq: eqUser }));
    const deleteFn = vi.fn(() => ({ eq: eqId }));

    let callCount = 0;
    vi.mocked(getSupabaseAdmin).mockReturnValue({
      from: vi.fn(() => {
        callCount += 1;
        return callCount === 1 ? cleanup.query : { delete: deleteFn };
      }),
    } as never);

    const { permanentlyDeleteBucket } = await import("@/src/lib/server/buckets");
    await expect(permanentlyDeleteBucket("bucket-1", "user-42")).resolves.toBe(true);
    expect(eqId).toHaveBeenCalledWith("id", "bucket-1");
    expect(eqUser).toHaveBeenCalledWith("user_id", "user-42");
  });

  it("cleans up expired trashed buckets opportunistically for the same user during reads", async () => {
    const { getSupabaseAdmin } = await import("@/src/lib/server/supabase-admin");
    const cleanup = createCleanupQuery();
    const selectActive = createSelectActiveBucketsQuery([]);

    let callCount = 0;
    vi.mocked(getSupabaseAdmin).mockReturnValue({
      from: vi.fn(() => {
        callCount += 1;
        return callCount === 1 ? cleanup.query : selectActive.query;
      }),
    } as never);

    const { getBuckets } = await import("@/src/lib/server/buckets");
    await expect(getBuckets("user-cleanup")).resolves.toEqual([]);
    expect(cleanup.spies.eq).toHaveBeenCalledWith("user_id", "user-cleanup");
    expect(cleanup.spies.lte).toHaveBeenCalledOnce();
  });

  it("reads trashed buckets only for the signed-in user", async () => {
    const { getSupabaseAdmin } = await import("@/src/lib/server/supabase-admin");
    const cleanup = createCleanupQuery();
    const selectTrashed = createSelectTrashedBucketsQuery([
      makeDbBucketRow({
        user_id: "user-abc",
        trashed_at: "2026-04-20T12:00:00.000Z",
        delete_after_at: "2026-05-20T12:00:00.000Z",
      }),
    ]);

    let callCount = 0;
    vi.mocked(getSupabaseAdmin).mockReturnValue({
      from: vi.fn(() => {
        callCount += 1;
        return callCount === 1 ? cleanup.query : selectTrashed.query;
      }),
    } as never);

    const { getTrashedBuckets } = await import("@/src/lib/server/buckets");
    const result = await getTrashedBuckets("user-abc");

    expect(selectTrashed.spies.eq).toHaveBeenCalledWith("user_id", "user-abc");
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe("bucket-1");
  });
});
