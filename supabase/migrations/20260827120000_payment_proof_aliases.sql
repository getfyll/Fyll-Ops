-- Normalize storefront/Fyll Checkout bank-transfer proof URLs onto payment rows.
-- This keeps the Payments page stable even when Checkout sends proof URLs under
-- compatibility aliases or nested objects.

create or replace function public.enrich_payment_proof_snapshot()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  matched_order record;
  source_order_id text := trim(coalesce(new.data->>'sourceOrderId', ''));
  source_value text := lower(trim(coalesce(new.data->>'source', '')));
  proof_url text := trim(coalesce(
    new.data->>'paymentProofUrl',
    new.data->>'proofUrl',
    new.data->>'proof_url',
    new.data->>'payment_proof_url',
    new.data->>'receiptUrl',
    new.data->>'receipt_url',
    new.data #>> '{receipt,url}',
    new.data #>> '{receipt,uri}',
    new.data #>> '{receipt,publicUrl}',
    new.data #>> '{receipt,public_url}',
    new.data #>> '{proof,url}',
    new.data #>> '{proof,uri}',
    new.data #>> '{proof,publicUrl}',
    new.data #>> '{proof,public_url}',
    new.data #>> '{bankTransfer,paymentProofUrl}',
    new.data #>> '{bankTransfer,proofUrl}',
    new.data #>> '{bankTransfer,proof_url}',
    new.data #>> '{bankTransfer,payment_proof_url}',
    new.data #>> '{bankTransfer,receiptUrl}',
    new.data #>> '{bankTransfer,receipt_url}',
    new.data #>> '{bankTransfer,receipt,url}',
    new.data #>> '{bankTransfer,receipt,uri}',
    new.data #>> '{bankTransfer,receipt,publicUrl}',
    new.data #>> '{bankTransfer,receipt,public_url}',
    new.data #>> '{bankTransfer,proof,url}',
    new.data #>> '{bankTransfer,proof,uri}',
    new.data #>> '{bankTransfer,proof,publicUrl}',
    new.data #>> '{bankTransfer,proof,public_url}',
    new.data #>> '{fyllCheckout,paymentProofUrl}',
    new.data #>> '{fyllCheckout,proofUrl}',
    new.data #>> '{fyllCheckout,proof_url}',
    new.data #>> '{fyllCheckout,payment_proof_url}',
    new.data #>> '{fyllCheckout,receiptUrl}',
    new.data #>> '{fyllCheckout,receipt_url}',
    new.data #>> '{fyllCheckout,receipt,url}',
    new.data #>> '{fyllCheckout,receipt,uri}',
    new.data #>> '{fyllCheckout,receipt,publicUrl}',
    new.data #>> '{fyllCheckout,receipt,public_url}',
    new.data #>> '{fyllCheckout,proof,url}',
    new.data #>> '{fyllCheckout,proof,uri}',
    new.data #>> '{fyllCheckout,proof,publicUrl}',
    new.data #>> '{fyllCheckout,proof,public_url}',
    ''
  ));
begin
  if source_value not in ('storefront', 'fyll_checkout') then
    return new;
  end if;

  if proof_url = '' and source_order_id <> '' then
    select o.data
    into matched_order
    from public.orders o
    where o.business_id = new.business_id
      and (
        o.id = source_order_id
        or o.data->>'orderNumber' = source_order_id
        or o.data->>'websiteOrderReference' = source_order_id
        or o.data->'fyllCheckout'->>'reference' = source_order_id
      )
    order by coalesce(o.updated_at, o.created_at, 'epoch'::timestamptz) desc
    limit 1;

    if matched_order.data is not null then
      proof_url := trim(coalesce(
        matched_order.data->>'paymentProofUrl',
        matched_order.data->>'proofUrl',
        matched_order.data->>'proof_url',
        matched_order.data->>'payment_proof_url',
        matched_order.data->>'receiptUrl',
        matched_order.data->>'receipt_url',
        matched_order.data #>> '{receipt,url}',
        matched_order.data #>> '{receipt,uri}',
        matched_order.data #>> '{receipt,publicUrl}',
        matched_order.data #>> '{receipt,public_url}',
        matched_order.data #>> '{proof,url}',
        matched_order.data #>> '{proof,uri}',
        matched_order.data #>> '{proof,publicUrl}',
        matched_order.data #>> '{proof,public_url}',
        matched_order.data #>> '{bankTransfer,paymentProofUrl}',
        matched_order.data #>> '{bankTransfer,proofUrl}',
        matched_order.data #>> '{bankTransfer,proof_url}',
        matched_order.data #>> '{bankTransfer,payment_proof_url}',
        matched_order.data #>> '{bankTransfer,receiptUrl}',
        matched_order.data #>> '{bankTransfer,receipt_url}',
        matched_order.data #>> '{bankTransfer,receipt,url}',
        matched_order.data #>> '{bankTransfer,receipt,uri}',
        matched_order.data #>> '{bankTransfer,receipt,publicUrl}',
        matched_order.data #>> '{bankTransfer,receipt,public_url}',
        matched_order.data #>> '{bankTransfer,proof,url}',
        matched_order.data #>> '{bankTransfer,proof,uri}',
        matched_order.data #>> '{bankTransfer,proof,publicUrl}',
        matched_order.data #>> '{bankTransfer,proof,public_url}',
        matched_order.data #>> '{fyllCheckout,paymentProofUrl}',
        matched_order.data #>> '{fyllCheckout,proofUrl}',
        matched_order.data #>> '{fyllCheckout,proof_url}',
        matched_order.data #>> '{fyllCheckout,payment_proof_url}',
        matched_order.data #>> '{fyllCheckout,receiptUrl}',
        matched_order.data #>> '{fyllCheckout,receipt_url}',
        matched_order.data #>> '{fyllCheckout,receipt,url}',
        matched_order.data #>> '{fyllCheckout,receipt,uri}',
        matched_order.data #>> '{fyllCheckout,receipt,publicUrl}',
        matched_order.data #>> '{fyllCheckout,receipt,public_url}',
        matched_order.data #>> '{fyllCheckout,proof,url}',
        matched_order.data #>> '{fyllCheckout,proof,uri}',
        matched_order.data #>> '{fyllCheckout,proof,publicUrl}',
        matched_order.data #>> '{fyllCheckout,proof,public_url}',
        ''
      ));
    end if;
  end if;

  if proof_url <> '' then
    new.data := new.data || jsonb_build_object(
      'paymentProofUrl', proof_url,
      'proofUrl', proof_url,
      'receiptUrl', proof_url
    );
    new.data := jsonb_set(
      new.data,
      '{fyllCheckout}',
      coalesce(new.data->'fyllCheckout', '{}'::jsonb) || jsonb_build_object(
        'paymentProofUrl', proof_url,
        'proofUrl', proof_url,
        'receiptUrl', proof_url
      ),
      true
    );
    new.data := jsonb_set(
      new.data,
      '{bankTransfer}',
      coalesce(new.data->'bankTransfer', '{}'::jsonb) || jsonb_build_object(
        'paymentProofUrl', proof_url,
        'proofUrl', proof_url,
        'receiptUrl', proof_url
      ),
      true
    );
  end if;

  return new;
end;
$$;

drop trigger if exists payment_proof_snapshot_trigger on public.payments;

create trigger payment_proof_snapshot_trigger
  before insert or update on public.payments
  for each row
  execute function public.enrich_payment_proof_snapshot();

with matched as (
  select
    p.id,
    p.business_id,
    trim(coalesce(
      p.data->>'paymentProofUrl',
      p.data->>'proofUrl',
      p.data->>'proof_url',
      p.data->>'payment_proof_url',
      p.data->>'receiptUrl',
      p.data->>'receipt_url',
      p.data #>> '{receipt,url}',
      p.data #>> '{receipt,uri}',
      p.data #>> '{receipt,publicUrl}',
      p.data #>> '{receipt,public_url}',
      p.data #>> '{proof,url}',
      p.data #>> '{proof,uri}',
      p.data #>> '{proof,publicUrl}',
      p.data #>> '{proof,public_url}',
      p.data #>> '{bankTransfer,paymentProofUrl}',
      p.data #>> '{bankTransfer,proofUrl}',
      p.data #>> '{bankTransfer,proof_url}',
      p.data #>> '{bankTransfer,payment_proof_url}',
      p.data #>> '{bankTransfer,receiptUrl}',
      p.data #>> '{bankTransfer,receipt_url}',
      p.data #>> '{bankTransfer,receipt,url}',
      p.data #>> '{bankTransfer,receipt,uri}',
      p.data #>> '{bankTransfer,receipt,publicUrl}',
      p.data #>> '{bankTransfer,receipt,public_url}',
      p.data #>> '{bankTransfer,proof,url}',
      p.data #>> '{bankTransfer,proof,uri}',
      p.data #>> '{bankTransfer,proof,publicUrl}',
      p.data #>> '{bankTransfer,proof,public_url}',
      p.data #>> '{fyllCheckout,paymentProofUrl}',
      p.data #>> '{fyllCheckout,proofUrl}',
      p.data #>> '{fyllCheckout,proof_url}',
      p.data #>> '{fyllCheckout,payment_proof_url}',
      p.data #>> '{fyllCheckout,receiptUrl}',
      p.data #>> '{fyllCheckout,receipt_url}',
      p.data #>> '{fyllCheckout,receipt,url}',
      p.data #>> '{fyllCheckout,receipt,uri}',
      p.data #>> '{fyllCheckout,receipt,publicUrl}',
      p.data #>> '{fyllCheckout,receipt,public_url}',
      p.data #>> '{fyllCheckout,proof,url}',
      p.data #>> '{fyllCheckout,proof,uri}',
      p.data #>> '{fyllCheckout,proof,publicUrl}',
      p.data #>> '{fyllCheckout,proof,public_url}',
      o.data->>'paymentProofUrl',
      o.data->>'proofUrl',
      o.data->>'proof_url',
      o.data->>'payment_proof_url',
      o.data->>'receiptUrl',
      o.data->>'receipt_url',
      o.data #>> '{receipt,url}',
      o.data #>> '{receipt,uri}',
      o.data #>> '{receipt,publicUrl}',
      o.data #>> '{receipt,public_url}',
      o.data #>> '{proof,url}',
      o.data #>> '{proof,uri}',
      o.data #>> '{proof,publicUrl}',
      o.data #>> '{proof,public_url}',
      o.data #>> '{bankTransfer,paymentProofUrl}',
      o.data #>> '{bankTransfer,proofUrl}',
      o.data #>> '{bankTransfer,proof_url}',
      o.data #>> '{bankTransfer,payment_proof_url}',
      o.data #>> '{bankTransfer,receiptUrl}',
      o.data #>> '{bankTransfer,receipt_url}',
      o.data #>> '{bankTransfer,receipt,url}',
      o.data #>> '{bankTransfer,receipt,uri}',
      o.data #>> '{bankTransfer,receipt,publicUrl}',
      o.data #>> '{bankTransfer,receipt,public_url}',
      o.data #>> '{bankTransfer,proof,url}',
      o.data #>> '{bankTransfer,proof,uri}',
      o.data #>> '{bankTransfer,proof,publicUrl}',
      o.data #>> '{bankTransfer,proof,public_url}',
      o.data #>> '{fyllCheckout,paymentProofUrl}',
      o.data #>> '{fyllCheckout,proofUrl}',
      o.data #>> '{fyllCheckout,proof_url}',
      o.data #>> '{fyllCheckout,payment_proof_url}',
      o.data #>> '{fyllCheckout,receiptUrl}',
      o.data #>> '{fyllCheckout,receipt_url}',
      o.data #>> '{fyllCheckout,receipt,url}',
      o.data #>> '{fyllCheckout,receipt,uri}',
      o.data #>> '{fyllCheckout,receipt,publicUrl}',
      o.data #>> '{fyllCheckout,receipt,public_url}',
      o.data #>> '{fyllCheckout,proof,url}',
      o.data #>> '{fyllCheckout,proof,uri}',
      o.data #>> '{fyllCheckout,proof,publicUrl}',
      o.data #>> '{fyllCheckout,proof,public_url}',
      ''
    )) as proof_url
  from public.payments p
  left join public.orders o
    on o.business_id = p.business_id
   and (
     o.id = trim(coalesce(p.data->>'sourceOrderId', ''))
     or o.data->>'orderNumber' = trim(coalesce(p.data->>'sourceOrderId', ''))
     or o.data->>'websiteOrderReference' = trim(coalesce(p.data->>'sourceOrderId', ''))
     or o.data->'fyllCheckout'->>'reference' = trim(coalesce(p.data->>'sourceOrderId', ''))
   )
  where lower(trim(coalesce(p.data->>'source', ''))) in ('storefront', 'fyll_checkout')
)
update public.payments p
set data = p.data
  || jsonb_build_object(
    'paymentProofUrl', matched.proof_url,
    'proofUrl', matched.proof_url,
    'receiptUrl', matched.proof_url
  )
  || jsonb_build_object(
    'fyllCheckout',
    coalesce(p.data->'fyllCheckout', '{}'::jsonb) || jsonb_build_object(
      'paymentProofUrl', matched.proof_url,
      'proofUrl', matched.proof_url,
      'receiptUrl', matched.proof_url
    )
  )
  || jsonb_build_object(
    'bankTransfer',
    coalesce(p.data->'bankTransfer', '{}'::jsonb) || jsonb_build_object(
      'paymentProofUrl', matched.proof_url,
      'proofUrl', matched.proof_url,
      'receiptUrl', matched.proof_url
    )
  )
from matched
where p.id = matched.id
  and p.business_id = matched.business_id
  and matched.proof_url <> '';

create or replace function public.sync_order_payment_proof_snapshot()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  proof_url text := trim(coalesce(
    new.data->>'paymentProofUrl',
    new.data->>'proofUrl',
    new.data->>'proof_url',
    new.data->>'payment_proof_url',
    new.data->>'receiptUrl',
    new.data->>'receipt_url',
    new.data #>> '{receipt,url}',
    new.data #>> '{receipt,uri}',
    new.data #>> '{receipt,publicUrl}',
    new.data #>> '{receipt,public_url}',
    new.data #>> '{proof,url}',
    new.data #>> '{proof,uri}',
    new.data #>> '{proof,publicUrl}',
    new.data #>> '{proof,public_url}',
    new.data #>> '{bankTransfer,paymentProofUrl}',
    new.data #>> '{bankTransfer,proofUrl}',
    new.data #>> '{bankTransfer,proof_url}',
    new.data #>> '{bankTransfer,payment_proof_url}',
    new.data #>> '{bankTransfer,receiptUrl}',
    new.data #>> '{bankTransfer,receipt_url}',
    new.data #>> '{bankTransfer,receipt,url}',
    new.data #>> '{bankTransfer,receipt,uri}',
    new.data #>> '{bankTransfer,receipt,publicUrl}',
    new.data #>> '{bankTransfer,receipt,public_url}',
    new.data #>> '{bankTransfer,proof,url}',
    new.data #>> '{bankTransfer,proof,uri}',
    new.data #>> '{bankTransfer,proof,publicUrl}',
    new.data #>> '{bankTransfer,proof,public_url}',
    new.data #>> '{fyllCheckout,paymentProofUrl}',
    new.data #>> '{fyllCheckout,proofUrl}',
    new.data #>> '{fyllCheckout,proof_url}',
    new.data #>> '{fyllCheckout,payment_proof_url}',
    new.data #>> '{fyllCheckout,receiptUrl}',
    new.data #>> '{fyllCheckout,receipt_url}',
    new.data #>> '{fyllCheckout,receipt,url}',
    new.data #>> '{fyllCheckout,receipt,uri}',
    new.data #>> '{fyllCheckout,receipt,publicUrl}',
    new.data #>> '{fyllCheckout,receipt,public_url}',
    new.data #>> '{fyllCheckout,proof,url}',
    new.data #>> '{fyllCheckout,proof,uri}',
    new.data #>> '{fyllCheckout,proof,publicUrl}',
    new.data #>> '{fyllCheckout,proof,public_url}',
    ''
  ));
begin
  if proof_url = '' then
    return new;
  end if;

  update public.payments p
  set data = p.data
    || jsonb_build_object(
      'paymentProofUrl', proof_url,
      'proofUrl', proof_url,
      'receiptUrl', proof_url
    )
    || jsonb_build_object(
      'fyllCheckout',
      coalesce(p.data->'fyllCheckout', '{}'::jsonb) || jsonb_build_object(
        'paymentProofUrl', proof_url,
        'proofUrl', proof_url,
        'receiptUrl', proof_url
      )
    )
    || jsonb_build_object(
      'bankTransfer',
      coalesce(p.data->'bankTransfer', '{}'::jsonb) || jsonb_build_object(
        'paymentProofUrl', proof_url,
        'proofUrl', proof_url,
        'receiptUrl', proof_url
      )
    ),
    updated_at = now()
  where p.business_id = new.business_id
    and lower(trim(coalesce(p.data->>'source', ''))) in ('storefront', 'fyll_checkout')
    and trim(coalesce(p.data->>'sourceOrderId', '')) in (
      new.id,
      trim(coalesce(new.data->>'orderNumber', '')),
      trim(coalesce(new.data->>'websiteOrderReference', '')),
      trim(coalesce(new.data->'fyllCheckout'->>'reference', ''))
    );

  return new;
end;
$$;

drop trigger if exists order_payment_proof_snapshot_trigger on public.orders;

create trigger order_payment_proof_snapshot_trigger
  after insert or update on public.orders
  for each row
  execute function public.sync_order_payment_proof_snapshot();
