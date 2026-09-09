-- Public storage bucket for business-facing assets such as logos used on
-- public tracking pages, public delivery confirmation pages, and email templates.
-- Run this in the Supabase SQL editor.

insert into storage.buckets (id, name, public, file_size_limit)
values ('business-assets', 'business-assets', true, 5242880)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit;

drop policy if exists storage_business_assets_public_read on storage.objects;
drop policy if exists storage_business_assets_authenticated_insert on storage.objects;
drop policy if exists storage_business_assets_authenticated_update on storage.objects;
drop policy if exists storage_business_assets_authenticated_delete on storage.objects;

create policy storage_business_assets_public_read
  on storage.objects
  for select
  using (bucket_id = 'business-assets');

create policy storage_business_assets_authenticated_insert
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'business-assets'
    and auth.uid() is not null
  );

create policy storage_business_assets_authenticated_update
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'business-assets'
    and auth.uid() is not null
  )
  with check (
    bucket_id = 'business-assets'
    and auth.uid() is not null
  );

create policy storage_business_assets_authenticated_delete
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'business-assets'
    and auth.uid() is not null
  );
