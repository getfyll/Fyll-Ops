-- Security hardening patch for collaboration attachments.
-- Run in Supabase SQL editor.

update storage.buckets
set public = false
where id = 'collaboration-attachments';

-- Harden ad-hoc products backup tables in public schema.
-- These tables should never be readable/writable by anon/authenticated roles.
do $$
declare
  backup_table record;
begin
  for backup_table in
    select tablename
    from pg_tables
    where schemaname = 'public'
      and tablename like 'products_backup_%'
  loop
    execute format('alter table public.%I enable row level security', backup_table.tablename);
    execute format('alter table public.%I force row level security', backup_table.tablename);
    execute format('revoke all on table public.%I from anon, authenticated', backup_table.tablename);
  end loop;
end
$$;

-- Harden businesses INSERT policy: no unrestricted WITH CHECK (true).
alter table public.businesses enable row level security;
alter table public.businesses add column if not exists owner_id text;

drop policy if exists businesses_insert_v2 on public.businesses;
drop policy if exists businesses_insert on public.businesses;
drop policy if exists businesses_insert_own on public.businesses;

create policy businesses_insert_own
  on public.businesses for insert
  with check (owner_id = auth.uid()::text);
