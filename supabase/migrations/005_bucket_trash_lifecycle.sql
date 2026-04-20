alter table if exists public.buckets
  add column if not exists trashed_at timestamptz;

alter table if exists public.buckets
  add column if not exists delete_after_at timestamptz;

create index if not exists buckets_user_id_trashed_at_idx
  on public.buckets (user_id, trashed_at);

create index if not exists buckets_user_id_delete_after_at_idx
  on public.buckets (user_id, delete_after_at)
  where trashed_at is not null;
