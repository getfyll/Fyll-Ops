-- Only lock a job's fee once the business has actually approved or paid its
-- bill. Previously it locked the moment a bill was submitted (billId set),
-- which blocked the partner from fixing a fee even while the bill was still
-- pending, or after the business queried/rejected it for correction.

create or replace function public.update_partner_portal_job_fee(
  token_input text,
  job_id_input text,
  amount_input numeric
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  matched_partner record;
  matched_job record;
  updated_data jsonb;
begin
  if coalesce(trim(token_input), '') = '' or coalesce(trim(job_id_input), '') = '' then
    return null;
  end if;

  if amount_input is null or amount_input < 0 then
    raise exception 'Fee must be a non-negative amount';
  end if;

  select p.id, p.business_id, p.data
  into matched_partner
  from public.partners p
  where p.data->>'magicLinkToken' = trim(token_input)
  limit 1;

  if not found then
    return null;
  end if;

  select j.id, j.business_id, j.data
  into matched_job
  from public.partner_jobs j
  where j.id = job_id_input
    and j.business_id = matched_partner.business_id
    and j.data->>'partnerId' = matched_partner.id
  limit 1;

  if not found then
    return null;
  end if;

  if coalesce(matched_job.data->>'billStatus', '') in ('approved', 'paid') then
    raise exception 'This bill has already been approved or paid and its fee is locked';
  end if;

  updated_data := matched_job.data || jsonb_build_object('amount', amount_input);

  update public.partner_jobs
  set data = updated_data, updated_at = now()
  where id = matched_job.id and business_id = matched_job.business_id;

  return updated_data;
end;
$$;

grant execute on function public.update_partner_portal_job_fee(text, text, numeric) to anon;
grant execute on function public.update_partner_portal_job_fee(text, text, numeric) to authenticated;
