import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migration002 = readFileSync(
  path.join(process.cwd(), "supabase/migrations/002_shopify_oauth_and_tokens.sql"),
  "utf8"
);
const migration003 = readFileSync(
  path.join(process.cwd(), "supabase/migrations/003_repair_shopify_oauth_states.sql"),
  "utf8"
);

describe("shopify oauth state migrations", () => {
  it("defines state as the canonical primary key for fresh databases", () => {
    expect(migration002).toContain("state text primary key");
    expect(migration002).toContain("shopify_oauth_states_user_id_idx");
    expect(migration002).toContain("shopify_oauth_states_expires_at_idx");
  });

  it("repairs drifted tables with legacy id primary keys and unintended user_id uniqueness", () => {
    expect(migration003).toContain("a.attname = 'id'");
    expect(migration003).toContain("a.attname = 'user_id'");
    expect(migration003).toContain("drop constraint");
    expect(migration003).toContain("add constraint shopify_oauth_states_pkey primary key (state)");
  });

  it("deduplicates existing state rows before enforcing the repaired primary key", () => {
    expect(migration003).toContain("partition by state");
    expect(migration003).toContain("row_num > 1");
  });
});
