-- returns.fyll.app: customers start a return without logging in.
--
-- submit_public_return() re-checks the order with the same gate as track.fyll.app (order
-- reference + the customer's own email), then writes a Return and its linked Case for that
-- business, both marked as coming from the customer portal. The customer never chooses the
-- business, order, customer name or price: those come from the matched order.
--
-- Proof photos are uploaded by the page to the public social-checkout-proofs bucket under
-- return-<key>/..., and only URLs in that folder are accepted here.
--
-- Run once in the Supabase SQL editor.

create or replace function public.submit_public_return(
  tracking_code_input text,
  email_input text,
  business_slug_input text,
  item_indexes jsonb,
  reason_input text,
  other_reason_input text,
  resolution_input text,
  message_input text,
  proof_urls jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  lookup jsonb;
  ord jsonb;
  biz_id text;
  clean_reason text := lower(trim(coalesce(reason_input, '')));
  clean_resolution text := lower(trim(coalesce(resolution_input, '')));
  clean_other text := left(trim(coalesce(other_reason_input, '')), 300);
  clean_message text := left(trim(coalesce(message_input, '')), 2000);
  order_items jsonb;
  picked jsonb := '[]'::jsonb;
  proofs jsonb := '[]'::jsonb;
  idx int;
  url text;
  item jsonb;
  product jsonb;
  variant jsonb;
  image_url text;
  item_count int := 0;
  recent_count int;
  existing jsonb;
  now_iso text := to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  return_id text := 'return-' || replace(gen_random_uuid()::text, '-', '');
  case_id text := 'case-' || replace(gen_random_uuid()::text, '-', '');
  return_ref text;
  case_number text;
  shipping_payer text;
  reason_label text;
  resolution_label text;
  summary text;
  attachments jsonb := '[]'::jsonb;
  n int := 0;
begin
  if clean_reason not in ('wrong_item', 'damaged', 'wrong_size', 'missing_part', 'changed_mind', 'other') then
    return jsonb_build_object('ok', false, 'error', 'invalid_reason');
  end if;
  if clean_resolution not in ('replacement', 'exchange', 'refund') then
    return jsonb_build_object('ok', false, 'error', 'invalid_resolution');
  end if;
  if clean_reason = 'other' and clean_other = '' then
    return jsonb_build_object('ok', false, 'error', 'missing_reason');
  end if;

  lookup := public.lookup_public_purchase_tracking(tracking_code_input, email_input, business_slug_input);
  ord := lookup->'order';
  if lookup is null or ord is null or jsonb_typeof(ord) <> 'object' then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  biz_id := coalesce(nullif(ord->>'businessId', ''), lookup->>'businessId');
  if coalesce(biz_id, '') = '' then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  -- Double taps and retries: the same order already has a portal return from the last 10 minutes.
  select r.data into existing
  from public.returns r
  where r.business_id = biz_id
    and r.data->>'orderId' = ord->>'id'
    and r.data->>'createdBy' = 'Customer portal'
    and r.created_at > now() - interval '10 minutes'
  order by r.created_at desc
  limit 1;
  if existing is not null then
    return jsonb_build_object('ok', true, 'ref', existing->>'ref', 'returnId', existing->>'id', 'businessId', biz_id, 'duplicate', true);
  end if;

  select count(*) into recent_count
  from public.returns r
  where r.business_id = biz_id
    and r.data->>'createdBy' = 'Customer portal'
    and r.created_at > now() - interval '1 hour';
  if recent_count >= 40 then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;

  -- Items: indexes into the order's own item list, so names and prices can't be made up.
  order_items := coalesce(ord->'items', '[]'::jsonb);
  if jsonb_typeof(coalesce(item_indexes, 'null'::jsonb)) = 'array' then
    for idx in select distinct (value #>> '{}')::int from jsonb_array_elements(item_indexes) where (value #>> '{}') ~ '^[0-9]{1,3}$'
    loop
      item := order_items->idx;
      continue when item is null;
      select p.value into product from jsonb_array_elements(coalesce(lookup->'products', '[]'::jsonb)) as p(value) where p.value->>'id' = item->>'productId' limit 1;
      variant := null;
      if product is not null then
        select v.value into variant from jsonb_array_elements(coalesce(product->'variants', '[]'::jsonb)) as v(value) where v.value->>'id' = item->>'variantId' limit 1;
      end if;
      image_url := coalesce(nullif(variant->>'imageUrl', ''), nullif(product->>'imageUrl', ''));
      picked := picked || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
        'productId', nullif(item->>'productId', ''),
        'variantId', nullif(item->>'variantId', ''),
        'name', coalesce(nullif(item->>'productName', ''), product->>'name', 'Item'),
        'variantName', nullif(item->>'variantName', ''),
        'quantity', coalesce(nullif(item->>'quantity', '')::numeric, 1),
        'unitPrice', coalesce(nullif(item->>'unitPrice', '')::numeric, 0),
        'imageUrl', image_url
      )));
      item_count := item_count + coalesce(round((nullif(item->>'quantity', ''))::numeric)::int, 1);
    end loop;
  end if;
  if jsonb_array_length(picked) = 0 then
    return jsonb_build_object('ok', false, 'error', 'no_items');
  end if;

  -- Proof photos: only files the page uploaded to the returns folder of the public proofs bucket.
  if jsonb_typeof(coalesce(proof_urls, 'null'::jsonb)) = 'array' then
    for url in select value #>> '{}' from jsonb_array_elements(proof_urls) limit 6
    loop
      continue when url is null or url !~ '^https://[^\s]+/storage/v1/object/public/social-checkout-proofs/return-[A-Za-z0-9-]+/[^\s]+$';
      proofs := proofs || to_jsonb(url);
    end loop;
  end if;
  if clean_reason in ('damaged', 'wrong_item', 'missing_part') and jsonb_array_length(proofs) = 0 then
    return jsonb_build_object('ok', false, 'error', 'photo_required');
  end if;

  -- Short, readable references, unique within the business.
  loop
    return_ref := 'RET-' || lpad((floor(random() * 900000) + 100000)::int::text, 6, '0');
    exit when not exists (select 1 from public.returns r where r.business_id = biz_id and r.data->>'ref' = return_ref);
  end loop;
  case_number := 'CASE-' || lpad((floor(random() * 900000) + 100000)::int::text, 6, '0');

  shipping_payer := case when clean_reason in ('wrong_item', 'damaged', 'missing_part') then 'seller' else 'customer' end;
  reason_label := case clean_reason
    when 'wrong_item' then 'Wrong item received'
    when 'damaged' then 'Damaged or scratched'
    when 'wrong_size' then 'Wrong size or fit'
    when 'missing_part' then 'Missing part'
    when 'changed_mind' then 'Changed mind'
    else coalesce(nullif(clean_other, ''), 'Other reason') end;
  resolution_label := case clean_resolution when 'replacement' then 'Replacement' when 'exchange' then 'Exchange' else 'Refund' end;
  summary := concat_ws(', ', variadic array(select concat(p->>'name', case when coalesce(p->>'variantName', '') <> '' then ' · ' || (p->>'variantName') else '' end) from jsonb_array_elements(picked) p));

  for url in select value #>> '{}' from jsonb_array_elements(proofs)
  loop
    n := n + 1;
    attachments := attachments || jsonb_build_array(jsonb_build_object(
      'id', 'case-attachment-' || replace(gen_random_uuid()::text, '-', ''),
      'label', 'Return photo ' || n,
      'uri', url,
      'preview', url,
      'description', 'Photo sent by the customer with the return request.',
      'uploadedAt', now_iso
    ));
  end loop;

  insert into public.returns (id, business_id, data, created_at, updated_at)
  values (return_id, biz_id, jsonb_strip_nulls(jsonb_build_object(
    'id', return_id,
    'ref', return_ref,
    'caseId', case_id,
    'orderId', ord->>'id',
    'orderNumber', coalesce(nullif(ord->>'orderNumber', ''), ord->>'id'),
    'customerName', coalesce(nullif(ord->>'customerName', ''), 'Customer'),
    'customerEmail', nullif(ord->>'customerEmail', ''),
    'customerPhone', nullif(ord->>'customerPhone', ''),
    'itemSummary', summary,
    'items', picked,
    'reason', clean_reason,
    'otherReason', case when clean_reason = 'other' then clean_other end,
    'resolution', clean_resolution,
    'shippingPayer', shipping_payer,
    'status', 'initiated',
    'notes', '',
    'returnNotes', '[]'::jsonb,
    'activity', jsonb_build_array(jsonb_build_object('id', 'return-activity-' || replace(gen_random_uuid()::text, '-', ''), 'date', now_iso, 'action', 'Return request ' || return_ref || ' submitted', 'user', 'Customer portal')),
    'customerMessage', clean_message,
    'proofImages', proofs,
    'createdAt', now_iso,
    'updatedAt', now_iso,
    'createdBy', 'Customer portal',
    'updatedBy', 'Customer portal'
  )), now(), now());

  insert into public.cases (id, business_id, data, created_at, updated_at)
  values (case_id, biz_id, jsonb_strip_nulls(jsonb_build_object(
    'id', case_id,
    'caseNumber', case_number,
    'returnId', return_id,
    'orderId', ord->>'id',
    'orderNumber', coalesce(nullif(ord->>'orderNumber', ''), ord->>'id'),
    'customerName', coalesce(nullif(ord->>'customerName', ''), 'Customer'),
    'type', 'Return',
    'status', 'Open',
    'priority', case when clean_reason in ('damaged', 'wrong_item', 'missing_part') then 'High' else 'Medium' end,
    'assignedTo', 'Support',
    'source', 'Web',
    'issueSummary', reason_label || ' · ' || resolution_label || ' · ' || summary,
    'originalCustomerMessage', clean_message,
    'attachments', attachments,
    'timeline', jsonb_build_array(jsonb_build_object('id', 'timeline-' || replace(gen_random_uuid()::text, '-', ''), 'date', now_iso, 'action', 'Return request ' || return_ref || ' submitted', 'user', 'Customer portal')),
    'createdAt', now_iso,
    'updatedAt', now_iso,
    'createdBy', 'Customer portal',
    'updatedBy', 'Customer portal'
  )), now(), now());

  return jsonb_build_object('ok', true, 'ref', return_ref, 'returnId', return_id, 'businessId', biz_id);
end;
$$;

revoke all on function public.submit_public_return(text, text, text, jsonb, text, text, text, text, jsonb) from public;
grant execute on function public.submit_public_return(text, text, text, jsonb, text, text, text, text, jsonb) to anon, authenticated;
