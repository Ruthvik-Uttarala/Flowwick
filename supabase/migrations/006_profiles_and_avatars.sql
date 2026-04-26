create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null default '',
  display_name text not null default '',
  shop_name text not null default '',
  bio text not null default '',
  avatar_url text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table if exists public.profiles
  add column if not exists email text not null default '';

alter table if exists public.profiles
  add column if not exists display_name text not null default '';

alter table if exists public.profiles
  add column if not exists shop_name text not null default '';

alter table if exists public.profiles
  add column if not exists bio text not null default '';

alter table if exists public.profiles
  add column if not exists avatar_url text not null default '';

alter table if exists public.profiles
  add column if not exists created_at timestamptz not null default now();

alter table if exists public.profiles
  add column if not exists updated_at timestamptz not null default now();

alter table if exists public.profiles enable row level security;

create index if not exists profiles_email_idx
  on public.profiles (email);

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

insert into storage.buckets (id, name, public)
values ('profile-avatars', 'profile-avatars', true)
on conflict (id) do nothing;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Users can view own profile avatars'
  ) then
    create policy "Users can view own profile avatars"
      on storage.objects
      for select
      to authenticated
      using (
        bucket_id = 'profile-avatars'
        and (storage.foldername(name))[1] = auth.uid()::text
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Users can upload own profile avatars'
  ) then
    create policy "Users can upload own profile avatars"
      on storage.objects
      for insert
      to authenticated
      with check (
        bucket_id = 'profile-avatars'
        and (storage.foldername(name))[1] = auth.uid()::text
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Users can update own profile avatars'
  ) then
    create policy "Users can update own profile avatars"
      on storage.objects
      for update
      to authenticated
      using (
        bucket_id = 'profile-avatars'
        and (storage.foldername(name))[1] = auth.uid()::text
      )
      with check (
        bucket_id = 'profile-avatars'
        and (storage.foldername(name))[1] = auth.uid()::text
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Users can delete own profile avatars'
  ) then
    create policy "Users can delete own profile avatars"
      on storage.objects
      for delete
      to authenticated
      using (
        bucket_id = 'profile-avatars'
        and (storage.foldername(name))[1] = auth.uid()::text
      );
  end if;
end $$;
