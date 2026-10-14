import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DbBucketRow } from "@/src/lib/server/buckets";

vi.mock("@/src/lib/server/supabase-admin", () => ({
  getSupabaseAdmin: vi.fn(),
}));

function cleanupClient() {
  const lte = vi.fn().mockResolvedValue({ error: null });
  const secondNot = vi.fn(() => ({ lte }));
  const firstNot = vi.fn(() => ({ not: secondNot }));
  const eq = vi.fn(() => ({ not: firstNot }));
  return { from: vi.fn(() => ({ delete: vi.fn(() => ({ eq })) })) };
}

function row(overrides: Partial<DbBucketRow> = {}): DbBucketRow {
  return {
    id: "bucket-1",
    user_id: "merchant-1",
    title_raw: "Draft title",
    description_raw: "Draft description",
    title_enhanced: "",
    description_enhanced: "",
    quantity: 1,
    price: 10,
    image_urls: [],
    status: "READY",
    shopify_created: false,
    shopify_product_id: "",
    shopify_product_url: "",
    instagram_published: false,
    instagram_post_id: "",
    instagram_post_url: "",
    error_message: "",
    trashed_at: null,
    delete_after_at: null,
    created_at: "2026-10-14T12:00:00.000Z",
    updated_at: "2026-10-14T12:00:00.000Z",
    ...overrides,
  };
}

function activeListClient(rows: DbBucketRow[]) {
  const order = vi.fn().mockResolvedValue({ data: rows, error: null });
  const is = vi.fn(() => ({ order }));
  const eq = vi.fn(() => ({ is }));
  const select = vi.fn(() => ({ eq }));
  return { client: { from: vi.fn(() => ({ select })) }, spies: { eq, is } };
}

function singleBucketClient(result: { data: DbBucketRow | null; error: unknown }) {
  const single = vi.fn().mockResolvedValue(result);
  const is = vi.fn(() => ({ single }));
  const eqUser = vi.fn(() => ({ is }));
  const eqId = vi.fn(() => ({ eq: eqUser }));
  const select = vi.fn(() => ({ eq: eqId }));
  return { client: { from: vi.fn(() => ({ select })) }, spies: { eqId, eqUser, is } };
}

describe("Supabase bucket persistence contracts", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("creates a merchant-owned row that can be reloaded", async () => {
    const { getSupabaseAdmin } = await import("@/src/lib/server/supabase-admin");
    const insert = vi.fn((payload: DbBucketRow) => {
      return {
        select: () => ({
          single: async () => ({ data: payload, error: null }),
        }),
      };
    });
    vi.mocked(getSupabaseAdmin)
      .mockReturnValueOnce(cleanupClient() as never)
      .mockReturnValueOnce({ from: vi.fn(() => ({ insert })) } as never);

    const { createBucket, getBuckets } = await import("@/src/lib/server/buckets");
    const created = await createBucket("merchant-1");
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ user_id: "merchant-1" }));
    expect(created.id).toBeTruthy();

    const persistedRow = insert.mock.calls[0]?.[0] as DbBucketRow;
    const reload = activeListClient([persistedRow]);
    vi.mocked(getSupabaseAdmin)
      .mockReturnValueOnce(cleanupClient() as never)
      .mockReturnValueOnce(reload.client as never);
    const buckets = await getBuckets("merchant-1");
    expect(buckets).toHaveLength(1);
    expect(buckets[0].id).toBe(created.id);
    expect(reload.spies.eq).toHaveBeenCalledWith("user_id", "merchant-1");
    expect(reload.spies.is).toHaveBeenCalledWith("trashed_at", null);
  });

  it("updates only the requested merchant's active row", async () => {
    const { getSupabaseAdmin } = await import("@/src/lib/server/supabase-admin");
    const existing = row();
    const lookup = singleBucketClient({ data: existing, error: null });
    const updated = row({ title_raw: "Persisted edit", updated_at: "2026-10-14T12:05:00.000Z" });
    const single = vi.fn().mockResolvedValue({ data: updated, error: null });
    const select = vi.fn(() => ({ single }));
    const is = vi.fn(() => ({ select }));
    const eqUser = vi.fn(() => ({ is }));
    const eqId = vi.fn(() => ({ eq: eqUser }));
    const update = vi.fn(() => ({ eq: eqId }));

    vi.mocked(getSupabaseAdmin)
      .mockReturnValueOnce(cleanupClient() as never)
      .mockReturnValueOnce(lookup.client as never)
      .mockReturnValueOnce({ from: vi.fn(() => ({ update })) } as never);

    const { patchBucket } = await import("@/src/lib/server/buckets");
    const result = await patchBucket("bucket-1", "merchant-1", { titleRaw: "Persisted edit" });
    expect(result?.titleRaw).toBe("Persisted edit");
    expect(eqId).toHaveBeenCalledWith("id", "bucket-1");
    expect(eqUser).toHaveBeenCalledWith("user_id", "merchant-1");
    expect(is).toHaveBeenCalledWith("trashed_at", null);
  });

  it("cannot reload another merchant's bucket", async () => {
    const { getSupabaseAdmin } = await import("@/src/lib/server/supabase-admin");
    const lookup = singleBucketClient({ data: null, error: { message: "No rows" } });
    vi.mocked(getSupabaseAdmin)
      .mockReturnValueOnce(cleanupClient() as never)
      .mockReturnValueOnce(lookup.client as never);

    const { getBucketById } = await import("@/src/lib/server/buckets");
    await expect(getBucketById("bucket-1", "merchant-2")).resolves.toBeNull();
    expect(lookup.spies.eqId).toHaveBeenCalledWith("id", "bucket-1");
    expect(lookup.spies.eqUser).toHaveBeenCalledWith("user_id", "merchant-2");
  });
});
