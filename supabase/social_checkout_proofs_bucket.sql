-- Public storage bucket for Social Checkout payment-proof photos, uploaded
-- by unauthenticated customers from the /checkout/[code] page.
-- Run this in the Supabase SQL editor.
--
-- Unlike business-assets (see business_assets_bucket.sql), insert here must
-- be allowed for anon, not just authenticated — there is no session at all
-- on the public checkout page. The real security boundary is the
-- submit_social_checkout_payment RPC (social_checkout_public_rpcs.sql),
-- which only accepts one submission per draft while it's still
-- 'awaiting_payment' — an object merely existing in this bucket isn't
-- itself sensitive, same reasoning business-assets already relies on for
-- public read.

insert into storage.buckets (id, name, public, file_size_limit)
values ('social-checkout-proofs', 'social-checkout-proofs', true, 5242880)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit;

drop policy if exists storage_social_checkout_proofs_public_read on storage.objects;
drop policy if exists storage_social_checkout_proofs_insert on storage.objects;

create policy storage_social_checkout_proofs_public_read
  on storage.objects
  for select
  using (bucket_id = 'social-checkout-proofs');

create policy storage_social_checkout_proofs_insert
  on storage.objects
  for insert
  to anon, authenticated
  with check (bucket_id = 'social-checkout-proofs');
