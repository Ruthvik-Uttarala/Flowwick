create table if not exists public.shopify_oauth_states (
  state text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  shop_domain text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

alter table if exists public.shopify_oauth_states
  add column if not exists state text;

alter table if exists public.shopify_oauth_states
  add column if not exists user_id uuid references auth.users(id) on delete cascade;

alter table if exists public.shopify_oauth_states
  add column if not exists shop_domain text;

alter table if exists public.shopify_oauth_states
  add column if not exists created_at timestamptz not null default now();

alter table if exists public.shopify_oauth_states
  add column if not exists expires_at timestamptz;

update public.shopify_oauth_states
set state = md5(random()::text || clock_timestamp()::text || coalesce(user_id::text, ''))
where state is null or btrim(state) = '';

update public.shopify_oauth_states
set created_at = now()
where created_at is null;

delete from public.shopify_oauth_states
where user_id is null
   or shop_domain is null
   or btrim(shop_domain) = ''
   or expires_at is null;

with ranked_states as (
  select
    ctid,
    row_number() over (
      partition by state
      order by created_at desc nulls last, expires_at desc nulls last
    ) as row_num
  from public.shopify_oauth_states
)
delete from public.shopify_oauth_states
where ctid in (
  select ctid
  from ranked_states
  where row_num > 1
);

do $$
declare
  constraint_name text;
begin
  for constraint_name in
    select c.conname
    from pg_constraint c
    join pg_attribute a
      on a.attrelid = c.conrelid
     and a.attnum = any (c.conkey)
    where c.conrelid = 'public.shopify_oauth_states'::regclass
      and c.contype = 'p'
      and array_length(c.conkey, 1) = 1
      and a.attname = 'id'
  loop
    execute format(
      'alter table public.shopify_oauth_states drop constraint %I',
      constraint_name
    );
  end loop;

  for constraint_name in
    select c.conname
    from pg_constraint c
    join pg_attribute a
      on a.attrelid = c.conrelid
     and a.attnum = any (c.conkey)
    where c.conrelid = 'public.shopify_oauth_states'::regclass
      and c.contype = 'u'
      and array_length(c.conkey, 1) = 1
      and a.attname = 'user_id'
  loop
    execute format(
      'alter table public.shopify_oauth_states drop constraint %I',
      constraint_name
    );
  end loop;
end $$;

do $$
declare
  index_name text;
begin
  for index_name in
    select indexrelid::regclass::text
    from pg_index i
    join pg_attribute a
      on a.attrelid = i.indrelid
     and a.attnum = any (i.indkey)
    where i.indrelid = 'public.shopify_oauth_states'::regclass
      and i.indisunique
      and not i.indisprimary
      and i.indnatts = 1
      and a.attname = 'user_id'
  loop
    execute format('drop index if exists %s', index_name);
  end loop;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.shopify_oauth_states'::regclass
      and contype = 'p'
  ) then
    alter table public.shopify_oauth_states
      add constraint shopify_oauth_states_pkey primary key (state);
  end if;
end $$;

alter table if exists public.shopify_oauth_states
  alter column state set not null;

alter table if exists public.shopify_oauth_states
  alter column user_id set not null;

alter table if exists public.shopify_oauth_states
  alter column shop_domain set not null;

alter table if exists public.shopify_oauth_states
  alter column created_at set default now();

alter table if exists public.shopify_oauth_states
  alter column created_at set not null;

alter table if exists public.shopify_oauth_states
  alter column expires_at set not null;

create index if not exists shopify_oauth_states_user_id_idx
  on public.shopify_oauth_states (user_id);

create index if not exists shopify_oauth_states_expires_at_idx
  on public.shopify_oauth_states (expires_at);

alter table if exists public.shopify_oauth_states enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'shopify_oauth_states'
      and policyname = 'Service role manages shopify oauth states'
  ) then
    create policy "Service role manages shopify oauth states"
      on public.shopify_oauth_states
      as permissive
      for all
      to service_role
      using (true)
      with check (true);
  end if;
end $$;
