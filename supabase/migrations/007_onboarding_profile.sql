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

create index if not exists profiles_onboarding_completed_idx
  on public.profiles (onboarding_completed);
