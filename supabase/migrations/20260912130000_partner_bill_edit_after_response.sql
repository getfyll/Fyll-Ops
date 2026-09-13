-- Allow partners to edit a bill (add/remove jobs) after it has been queried,
-- approved, or rejected -- previously only 'pending' bills were editable.
-- Editing still resets the bill back to 'pending' for re-review, and now also
-- clears the stale response fields (billRespondedAt/billNote/billPaidAt) so
-- the UI doesn't show an old response against a bill that's pending again.
-- Only 'paid' bills remain locked, since money has already changed hands.

create or replace function public.update_partner_bill_jobs(
  token_input text,
  bill_id_input text,
  job_ids_input text[]
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  matched_partner record;
  bill_status text;
  now_iso text := to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  bill_total numeric;
  job_count integer;
begin
  if coalesce(trim(bill_id_input), '') = '' then
    return null;
  end if;

  if coalesce(trim(token_input), '') <> '' then
    select p.id, p.business_id, p.data
    into matched_partner
    from public.partners p
    where p.data->>'magicLinkToken' = trim(token_input)
    limit 1;
  elsif auth.uid() is not null then
    select p.id, p.business_id, p.data
    into matched_partner
    from public.partners p
    where p.auth_user_id = auth.uid()
    limit 1;
  end if;

  if not found then
    return null;
  end if;

  select j.data->>'billStatus'
  into bill_status
  from public.partner_jobs j
  where j.business_id = matched_partner.business_id
    and j.data->>'partnerId' = matched_partner.id
    and j.data->>'billId' = bill_id_input
  limit 1;

  if bill_status is null then
    return null;
  end if;

  if bill_status = 'paid' then
    raise exception 'This bill has already been paid and can no longer be edited';
  end if;

  update public.partner_jobs j
  set data = (j.data - 'billId' - 'billStatus' - 'billSubmittedAt' - 'billNote' - 'billRespondedAt' - 'billPaidAt'),
      updated_at = now()
  where j.business_id = matched_partner.business_id
    and j.data->>'partnerId' = matched_partner.id
    and j.data->>'billId' = bill_id_input
    and not (j.id = any(job_ids_input));

  update public.partner_jobs j
  set data = (j.data - 'billRespondedAt' - 'billNote' - 'billPaidAt') || jsonb_build_object(
        'billId', bill_id_input,
        'billStatus', 'pending',
        'billSubmittedAt', coalesce(j.data->>'billSubmittedAt', now_iso)
      ),
      updated_at = now()
  where j.business_id = matched_partner.business_id
    and j.data->>'partnerId' = matched_partner.id
    and j.id = any(job_ids_input)
    and coalesce(j.data->>'billId', '') in ('', bill_id_input)
    and coalesce(nullif(j.data->>'amount', '')::numeric, 0) > 0
    and coalesce(j.data->>'status', '') <> 'cancelled'
    and coalesce((j.data->>'hasOpenIssue')::boolean, false) = false;

  select coalesce(sum(nullif(j.data->>'amount', '')::numeric), 0), count(*)
  into bill_total, job_count
  from public.partner_jobs j
  where j.business_id = matched_partner.business_id
    and j.data->>'partnerId' = matched_partner.id
    and j.data->>'billId' = bill_id_input;

  if job_count = 0 then
    return jsonb_build_object('billId', null, 'total', 0, 'jobCount', 0);
  end if;

  return jsonb_build_object('billId', bill_id_input, 'total', bill_total, 'jobCount', job_count);
end;
$$;

grant execute on function public.update_partner_bill_jobs(text, text, text[]) to anon;
grant execute on function public.update_partner_bill_jobs(text, text, text[]) to authenticated;
