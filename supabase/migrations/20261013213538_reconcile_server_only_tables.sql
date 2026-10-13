-- FW-004: reconcile drifted server-only tables without rewriting existing data.
-- Both tables are accessed exclusively through server-side service-role clients.

alter table if exists public.buckets
  add column if not exists trashed_at timestamptz;

alter table if exists public.buckets
  add column if not exists delete_after_at timestamptz;

create index if not exists buckets_user_id_trashed_at_idx
  on public.buckets (user_id, trashed_at);

create index if not exists buckets_user_id_delete_after_at_idx
  on public.buckets (user_id, delete_after_at)
  where trashed_at is not null;

alter table public.buckets enable row level security;
alter table public.integration_settings enable row level security;

-- The browser must not access either server-only table through the Data API.
revoke all privileges on table public.buckets from anon, authenticated;
revoke all privileges on table public.integration_settings from anon, authenticated;

-- Remove legacy or drifted policies. With browser-role grants revoked, no
-- merchant can read another merchant's rows or integration credentials.
do $$
declare
  policy_record record;
begin
  for policy_record in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in ('buckets', 'integration_settings')
  loop
    execute format(
      'drop policy if exists %I on %I.%I',
      policy_record.policyname,
      policy_record.schemaname,
      policy_record.tablename
    );
  end loop;
end
$$;

-- Supabase service_role bypasses RLS, but explicit DML grants keep the intended
-- backend contract stable if the project's default privileges have drifted.
grant select, insert, update, delete on table public.buckets to service_role;
grant select, insert, update, delete on table public.integration_settings to service_role;
