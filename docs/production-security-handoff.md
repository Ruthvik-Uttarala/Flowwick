# FW-003 / FW-004 production handoff

This change prepares production configuration and database security changes. It
does not apply SQL, configure providers, modify Vercel, or deploy the app.

## Required production configuration

Configure these names on the selected `uttarala-ruthvik/flowwick` Vercel project:

- `NEXT_PUBLIC_APP_URL=https://flowwick.vercel.app`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `OPENAI_API_KEY`
- `SHOPIFY_CLIENT_ID`
- `SHOPIFY_CLIENT_SECRET`
- `INSTAGRAM_ENABLED`
- `META_APP_ID`
- `META_APP_SECRET`
- `META_TOKEN_ENCRYPTION_KEY`

Do not copy values from the older Vercel project without an explicit credential
review. Run `npm run check:config` in the intended production environment before
deployment.

Provider-side callback allowlists must be configured separately and must include:

- Shopify: `https://flowwick.vercel.app/api/shopify/callback`
- Meta: `https://flowwick.vercel.app/api/instagram/callback`

These provider settings have not been changed or verified by this PR.

## Migration verification

Apply `20261013213538_reconcile_server_only_tables.sql` only through a separately
approved production change. Before applying, take a database backup and capture
the current grants, policies, columns, indexes, profile constraint, and storage
bucket inventory. After applying, run these read-only checks:

```sql
select relname, relrowsecurity
from pg_class
where oid in ('public.buckets'::regclass, 'public.integration_settings'::regclass);

select grantee, table_name, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name in ('buckets', 'integration_settings')
order by table_name, grantee, privilege_type;

select schemaname, tablename, policyname, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename in ('buckets', 'integration_settings');

select table_name, column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and (
    (table_name = 'buckets' and column_name in ('trashed_at', 'delete_after_at'))
    or (table_name = 'integration_settings' and column_name = 'user_id')
  );

select indexname, indexdef
from pg_indexes
where schemaname = 'public'
  and indexname in (
    'buckets_user_id_trashed_at_idx',
    'buckets_user_id_delete_after_at_idx'
  );

select conname, pg_get_constraintdef(oid)
from pg_constraint
where conrelid = 'public.profiles'::regclass
  and conname = 'profiles_onboarding_step_range';

select id from storage.buckets
where id in ('product_images', 'profile-avatars')
order by id;
```

Also verify with isolated test identities that `anon` and `authenticated` cannot
select, insert, update, or delete either sensitive table, while a reviewed
server-side service-role smoke test can read and write only its intended merchant
record through the existing application paths.

## Recovery plan

If server-side access fails, stop application writes and restore the pre-change
backup. For a narrowly diagnosed privilege-only failure, re-grant the required
DML privileges to `service_role`; do not restore browser-role grants or credential
policies. The added nullable columns and indexes are backward-compatible and do
not require destructive rollback. Any policy restoration must come from the
captured pre-change definitions and receive a separate security review.
