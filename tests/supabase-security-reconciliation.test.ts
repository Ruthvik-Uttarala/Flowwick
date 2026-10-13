import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = path.join(
  process.cwd(),
  "supabase/migrations/20261013213538_reconcile_server_only_tables.sql",
);
const migration = readFileSync(migrationPath, "utf8").toLowerCase();

describe("FW-004 server-only table reconciliation", () => {
  it.each(["buckets", "integration_settings"])(
    "enables RLS and removes browser-role privileges from %s",
    (table) => {
      expect(migration).toContain(`alter table public.${table} enable row level security`);
      expect(migration).toContain(
        `revoke all privileges on table public.${table} from anon, authenticated`,
      );
    },
  );

  it("removes policies that could expose sensitive rows and does not add permissive ones", () => {
    expect(migration).toContain("from pg_policies");
    expect(migration).toContain("drop policy if exists");
    expect(migration).not.toMatch(/create\s+policy/);
    expect(migration).not.toMatch(/to\s+(anon|authenticated)/);
  });

  it("preserves the service-role backend access contract", () => {
    expect(migration).toContain(
      "grant select, insert, update, delete on table public.buckets to service_role",
    );
    expect(migration).toContain(
      "grant select, insert, update, delete on table public.integration_settings to service_role",
    );
  });

  it("repairs bucket lifecycle columns and indexes idempotently", () => {
    expect(migration).toContain("add column if not exists trashed_at timestamptz");
    expect(migration).toContain("add column if not exists delete_after_at timestamptz");
    expect(migration).toContain("create index if not exists buckets_user_id_trashed_at_idx");
    expect(migration).toContain("create index if not exists buckets_user_id_delete_after_at_idx");
    expect(migration).toContain("where trashed_at is not null");
  });

  it("does not coerce merchant identifiers or destructively alter protected objects", () => {
    expect(migration).not.toMatch(/alter\s+column\s+user_id\s+type/);
    expect(migration).not.toMatch(/\b(drop|truncate)\s+table\b/);
    expect(migration).not.toMatch(/\bdelete\s+from\b/);
    expect(migration).not.toContain("storage.buckets");
    expect(migration).not.toContain("public.profiles");
    expect(migration).not.toContain("security definer");
  });
});
