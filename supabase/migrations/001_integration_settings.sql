-- Run this in Supabase SQL Editor to create the integration_settings table.

create table if not exists public.integration_settings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  shopify_store_domain text not null default '',
  shopify_client_id text not null default '',
  shopify_client_secret text not null default '',
  instagram_access_token text not null default '',
  instagram_business_account_id text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint integration_settings_user_id_key unique (user_id)
);

-- Allow service role full access (RLS bypass via service key).
alter table public.integration_settings enable row level security;

-- Policy: users can read/write their own rows.
create policy "Users manage own settings"
  on public.integration_settings
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
