import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migration005 = readFileSync(
  path.join(process.cwd(), "supabase/migrations/005_bucket_trash_lifecycle.sql"),
  "utf8"
);

describe("bucket trash lifecycle migration", () => {
  it("adds explicit trash lifecycle timestamps to buckets", () => {
    expect(migration005).toContain("add column if not exists trashed_at timestamptz");
    expect(migration005).toContain("add column if not exists delete_after_at timestamptz");
  });

  it("adds indexes to keep user-scoped trash reads and cleanup efficient", () => {
    expect(migration005).toContain("buckets_user_id_trashed_at_idx");
    expect(migration005).toContain("buckets_user_id_delete_after_at_idx");
    expect(migration005).toContain("where trashed_at is not null");
  });
});
