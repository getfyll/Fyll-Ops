-- Partner accounts couldn't view/open job attachments (images/documents) in
-- the collaboration-attachments bucket. The storage RLS policies only
-- recognized business staff (via public.profiles), and a partner's auth
-- account has no profiles row, so public.get_user_business_id() returned
-- null and every signed-URL request was silently denied.
--
-- Add a helper that also resolves the business_id for a signed-in partner,
-- and OR it into the existing storage policies.

create or replace function public.get_partner_business_id()
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select business_id
  from public.partners
  where auth_user_id = auth.uid()
  limit 1;
$$;

drop policy if exists storage_collaboration_attachments_select_v1 on storage.objects;
drop policy if exists storage_collaboration_attachments_insert_v1 on storage.objects;
drop policy if exists storage_collaboration_attachments_update_v1 on storage.objects;
drop policy if exists storage_collaboration_attachments_delete_v1 on storage.objects;

create policy storage_collaboration_attachments_select_v1
  on storage.objects for select
  using (
    bucket_id = 'collaboration-attachments'
    and (
      (storage.foldername(name))[1] = public.get_user_business_id()
      or (storage.foldername(name))[1] = public.get_partner_business_id()
    )
  );

create policy storage_collaboration_attachments_insert_v1
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'collaboration-attachments'
    and (
      (storage.foldername(name))[1] = public.get_user_business_id()
      or (storage.foldername(name))[1] = public.get_partner_business_id()
    )
  );

create policy storage_collaboration_attachments_update_v1
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'collaboration-attachments'
    and (
      (storage.foldername(name))[1] = public.get_user_business_id()
      or (storage.foldername(name))[1] = public.get_partner_business_id()
    )
  )
  with check (
    bucket_id = 'collaboration-attachments'
    and (
      (storage.foldername(name))[1] = public.get_user_business_id()
      or (storage.foldername(name))[1] = public.get_partner_business_id()
    )
  );

create policy storage_collaboration_attachments_delete_v1
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'collaboration-attachments'
    and (
      (storage.foldername(name))[1] = public.get_user_business_id()
      or (storage.foldername(name))[1] = public.get_partner_business_id()
    )
  );
