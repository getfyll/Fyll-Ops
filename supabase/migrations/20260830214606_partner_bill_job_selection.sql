-- Let a partner pick exactly which unbilled jobs go into a new bill instead
-- of always bundling everything. job_ids_input is optional and defaults to
-- null (bundle every unbilled priced job), so existing callers keep working.

drop function if exists public.submit_partner_bill(text);

create or replace function public.submit_partner_bill(
  token_input text,
  job_ids_input text[] default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  matched_partner record;
  new_bill_id text;
  now_iso text := to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  affected_count integer;
  bill_total numeric;
begin
  if coalesce(trim(token_input), '') = '' then
    return null;
  end if;

  select p.id, p.business_id, p.data
  into matched_partner
  from public.partners p
  where p.data->>'magicLinkToken' = trim(token_input)
  limit 1;

  if not found then
    return null;
  end if;

  select coalesce(sum(nullif(j.data->>'amount', '')::numeric), 0)
  into bill_total
  from public.partner_jobs j
  where j.business_id = matched_partner.business_id
    and j.data->>'partnerId' = matched_partner.id
    and coalesce(j.data->>'billId', '') = ''
    and coalesce(nullif(j.data->>'amount', '')::numeric, 0) > 0
    and coalesce(j.data->>'status', '') <> 'cancelled'
    and (job_ids_input is null or j.id = any(job_ids_input));

  if bill_total is null or bill_total <= 0 then
    return jsonb_build_object('billId', null, 'total', 0, 'jobCount', 0);
  end if;

  new_bill_id := 'pbill-' || replace(gen_random_uuid()::text, '-', '');

  update public.partner_jobs j
  set
    data = j.data || jsonb_build_object(
      'billId', new_bill_id,
      'billStatus', 'pending',
      'billSubmittedAt', now_iso
    ),
    updated_at = now()
  where j.business_id = matched_partner.business_id
    and j.data->>'partnerId' = matched_partner.id
    and coalesce(j.data->>'billId', '') = ''
    and coalesce(nullif(j.data->>'amount', '')::numeric, 0) > 0
    and coalesce(j.data->>'status', '') <> 'cancelled'
    and (job_ids_input is null or j.id = any(job_ids_input));

  get diagnostics affected_count = row_count;

  return jsonb_build_object('billId', new_bill_id, 'total', bill_total, 'jobCount', affected_count);
end;
$$;

grant execute on function public.submit_partner_bill(text, text[]) to anon;
grant execute on function public.submit_partner_bill(text, text[]) to authenticated;
