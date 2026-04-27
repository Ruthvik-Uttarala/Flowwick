create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null default '',
  display_name text not null default '',
  avatar_url text not null default '',
  store_name text not null default '',
  industry text not null default '',
  instagram_handle text not null default '',
  niche text not null default '',
  onboarding_completed boolean not null default false,
  onboarding_step integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table if exists public.profiles
  add column if not exists email text not null default '';

alter table if exists public.profiles
  add column if not exists display_name text not null default '';

alter table if exists public.profiles
  add column if not exists avatar_url text not null default '';

alter table if exists public.profiles
  add column if not exists store_name text not null default '';

alter table if exists public.profiles
  add column if not exists industry text not null default '';

alter table if exists public.profiles
  add column if not exists instagram_handle text not null default '';

alter table if exists public.profiles
  add column if not exists niche text not null default '';

alter table if exists public.profiles
  add column if not exists onboarding_completed boolean not null default false;

alter table if exists public.profiles
  add column if not exists onboarding_step integer not null default 1;

alter table if exists public.profiles
  add column if not exists created_at timestamptz not null default now();

alter table if exists public.profiles
  add column if not exists updated_at timestamptz not null default now();

alter table if exists public.profiles
  add column if not exists shop_name text not null default '';

alter table if exists public.profiles
  add column if not exists bio text not null default '';

update public.profiles
set store_name = coalesce(nullif(store_name, ''), shop_name, '')
where coalesce(store_name, '') = '';

update public.profiles
set shop_name = coalesce(nullif(shop_name, ''), store_name, '')
where coalesce(shop_name, '') = '';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_onboarding_step_range'
  ) then
    alter table public.profiles
      add constraint profiles_onboarding_step_range
      check (onboarding_step between 1 and 3)
      not valid;
  end if;
end $$;

alter table if exists public.profiles
  validate constraint profiles_onboarding_step_range;

alter table if exists public.profiles
  enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'profiles'
      and policyname = 'Users can view own profile'
  ) then
    create policy "Users can view own profile"
      on public.profiles
      for select
      to authenticated
      using (auth.uid() = id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'profiles'
      and policyname = 'Users can insert own profile'
  ) then
    create policy "Users can insert own profile"
      on public.profiles
      for insert
      to authenticated
      with check (auth.uid() = id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'profiles'
      and policyname = 'Users can update own profile'
  ) then
    create policy "Users can update own profile"
      on public.profiles
      for update
      to authenticated
      using (auth.uid() = id)
      with check (auth.uid() = id);
  end if;
end $$;

create index if not exists profiles_email_idx
  on public.profiles (email);

create index if not exists profiles_onboarding_completed_idx
  on public.profiles (onboarding_completed);
