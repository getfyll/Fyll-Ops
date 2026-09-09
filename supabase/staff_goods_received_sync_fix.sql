-- Allow staff/team members to persist Goods Received changes.
-- Goods Received writes procurement line updates, inventory stock, and restock logs.
-- Existing owner-only RLS policies can make staff saves disappear after refresh.

create or replace function public.can_access_business(target_business_id text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and business_id = target_business_id
    union
    select 1
    from public.team_members
    where user_id = auth.uid()
      and business_id = target_business_id
  );
$$;

alter table public.procurements enable row level security;
alter table public.products enable row level security;
alter table public.restock_logs enable row level security;

drop policy if exists procurements_team_goods_received_select on public.procurements;
drop policy if exists procurements_team_goods_received_insert on public.procurements;
drop policy if exists procurements_team_goods_received_update on public.procurements;
drop policy if exists procurements_team_goods_received_delete on public.procurements;

create policy procurements_team_goods_received_select
  on public.procurements for select
  using (public.can_access_business(business_id));

create policy procurements_team_goods_received_insert
  on public.procurements for insert
  with check (public.can_access_business(business_id));

create policy procurements_team_goods_received_update
  on public.procurements for update
  using (public.can_access_business(business_id))
  with check (public.can_access_business(business_id));

create policy procurements_team_goods_received_delete
  on public.procurements for delete
  using (public.can_access_business(business_id));

drop policy if exists products_team_goods_received_select on public.products;
drop policy if exists products_team_goods_received_insert on public.products;
drop policy if exists products_team_goods_received_update on public.products;
drop policy if exists products_team_goods_received_delete on public.products;

create policy products_team_goods_received_select
  on public.products for select
  using (public.can_access_business(business_id));

create policy products_team_goods_received_insert
  on public.products for insert
  with check (public.can_access_business(business_id));

create policy products_team_goods_received_update
  on public.products for update
  using (public.can_access_business(business_id))
  with check (public.can_access_business(business_id));

create policy products_team_goods_received_delete
  on public.products for delete
  using (public.can_access_business(business_id));

drop policy if exists restock_logs_team_goods_received_select on public.restock_logs;
drop policy if exists restock_logs_team_goods_received_insert on public.restock_logs;
drop policy if exists restock_logs_team_goods_received_update on public.restock_logs;
drop policy if exists restock_logs_team_goods_received_delete on public.restock_logs;

create policy restock_logs_team_goods_received_select
  on public.restock_logs for select
  using (public.can_access_business(business_id));

create policy restock_logs_team_goods_received_insert
  on public.restock_logs for insert
  with check (public.can_access_business(business_id));

create policy restock_logs_team_goods_received_update
  on public.restock_logs for update
  using (public.can_access_business(business_id))
  with check (public.can_access_business(business_id));

create policy restock_logs_team_goods_received_delete
  on public.restock_logs for delete
  using (public.can_access_business(business_id));

-- Procurement images, QC proof, and attachments use the shared private
-- collaboration-attachments bucket under the business_id folder.
insert into storage.buckets (id, name, public, file_size_limit)
values ('collaboration-attachments', 'collaboration-attachments', false, 15728640)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit;

drop policy if exists storage_team_business_attachments_select on storage.objects;
drop policy if exists storage_team_business_attachments_insert on storage.objects;
drop policy if exists storage_team_business_attachments_update on storage.objects;
drop policy if exists storage_team_business_attachments_delete on storage.objects;

create policy storage_team_business_attachments_select
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'collaboration-attachments'
    and public.can_access_business((storage.foldername(name))[1])
  );

create policy storage_team_business_attachments_insert
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'collaboration-attachments'
    and public.can_access_business((storage.foldername(name))[1])
  );

create policy storage_team_business_attachments_update
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'collaboration-attachments'
    and public.can_access_business((storage.foldername(name))[1])
  )
  with check (
    bucket_id = 'collaboration-attachments'
    and public.can_access_business((storage.foldername(name))[1])
  );

create policy storage_team_business_attachments_delete
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'collaboration-attachments'
    and public.can_access_business((storage.foldername(name))[1])
  );
