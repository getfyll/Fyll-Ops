-- Fix businesses RLS with text-safe auth uid comparison.
-- Run in Supabase SQL editor.

alter table public.businesses enable row level security;

-- Ensure owner_id exists for safe insert checks.
alter table public.businesses
  add column if not exists owner_id text;

drop policy if exists businesses_insert_v2 on public.businesses;
drop policy if exists businesses_insert on public.businesses;
drop policy if exists businesses_insert_own on public.businesses;
drop policy if exists businesses_select_own on public.businesses;
drop policy if exists businesses_update_own on public.businesses;
drop policy if exists businesses_delete_own on public.businesses;

create policy businesses_insert_own
  on public.businesses for insert
  with check (owner_id = auth.uid()::text);

create policy businesses_select_own
  on public.businesses for select
  using (
    id::text = (
      select business_id::text
      from public.profiles
      where id::text = auth.uid()::text
    )
  );

create policy businesses_update_own
  on public.businesses for update
  using (
    id::text = (
      select business_id::text
      from public.profiles
      where id::text = auth.uid()::text
    )
  )
  with check (
    owner_id = auth.uid()::text
  );

create policy businesses_delete_own
  on public.businesses for delete
  using (
    id::text = (
      select business_id::text
      from public.profiles
      where id::text = auth.uid()::text
    )
  );
