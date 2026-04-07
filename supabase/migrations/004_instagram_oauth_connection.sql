alter table if exists public.integration_settings
  add column if not exists instagram_user_access_token text not null default '';

alter table if exists public.integration_settings
  add column if not exists instagram_page_id text not null default '';

alter table if exists public.integration_settings
  add column if not exists instagram_page_name text not null default '';

alter table if exists public.integration_settings
  add column if not exists instagram_connection_status text not null default 'disconnected';

alter table if exists public.integration_settings
  add column if not exists instagram_connection_error_code text not null default '';

alter table if exists public.integration_settings
  add column if not exists instagram_last_validated_at timestamptz;

alter table if exists public.integration_settings
  add column if not exists instagram_token_expires_at timestamptz;

alter table if exists public.integration_settings
  add column if not exists instagram_candidate_accounts jsonb not null default '[]'::jsonb;

create table if not exists public.instagram_oauth_states (
  state text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

alter table if exists public.instagram_oauth_states
  add column if not exists state text;

alter table if exists public.instagram_oauth_states
  add column if not exists user_id uuid references auth.users(id) on delete cascade;

alter table if exists public.instagram_oauth_states
  add column if not exists created_at timestamptz not null default now();

alter table if exists public.instagram_oauth_states
  add column if not exists expires_at timestamptz;

update public.instagram_oauth_states
set created_at = now()
where created_at is null;

alter table if exists public.instagram_oauth_states
  alter column created_at set default now();

alter table if exists public.instagram_oauth_states
  alter column created_at set not null;

create index if not exists instagram_oauth_states_user_id_idx
  on public.instagram_oauth_states (user_id);

create index if not exists instagram_oauth_states_expires_at_idx
  on public.instagram_oauth_states (expires_at);

alter table if exists public.instagram_oauth_states enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.instagram_oauth_states'::regclass
      and contype = 'p'
  ) then
    alter table public.instagram_oauth_states
      add constraint instagram_oauth_states_pkey primary key (state);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'instagram_oauth_states'
      and policyname = 'Service role manages instagram oauth states'
  ) then
    create policy "Service role manages instagram oauth states"
      on public.instagram_oauth_states
      as permissive
      for all
      to service_role
      using (true)
      with check (true);
  end if;
end $$;
