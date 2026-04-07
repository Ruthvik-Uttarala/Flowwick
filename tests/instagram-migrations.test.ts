import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migration004 = readFileSync(
  path.join(process.cwd(), "supabase/migrations/004_instagram_oauth_connection.sql"),
  "utf8"
);

describe("instagram oauth migrations", () => {
  it("creates the instagram oauth states table keyed by state", () => {
    expect(migration004).toContain("create table if not exists public.instagram_oauth_states");
    expect(migration004).toContain("state text primary key");
    expect(migration004).toContain("instagram_oauth_states_user_id_idx");
    expect(migration004).toContain("instagram_oauth_states_expires_at_idx");
  });

  it("adds the dedicated instagram oauth connection columns to integration settings", () => {
    expect(migration004).toContain("add column if not exists instagram_user_access_token text");
    expect(migration004).toContain("add column if not exists instagram_page_id text");
    expect(migration004).toContain("add column if not exists instagram_page_name text");
    expect(migration004).toContain("add column if not exists instagram_connection_status text");
    expect(migration004).toContain("add column if not exists instagram_connection_error_code text");
    expect(migration004).toContain("add column if not exists instagram_last_validated_at timestamptz");
    expect(migration004).toContain("add column if not exists instagram_token_expires_at timestamptz");
    expect(migration004).toContain("add column if not exists instagram_candidate_accounts jsonb");
  });
});
