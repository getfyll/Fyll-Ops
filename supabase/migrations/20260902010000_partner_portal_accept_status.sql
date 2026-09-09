-- Accepting a partner job is its own first workflow step. Partners move a
-- newly sent job from sent -> accepted, then later update it to in_progress,
-- ready, collected, etc. The portal status RPC previously only stamped
-- acceptedAt for in_progress and rejected accepted unless the partner had
-- manually added it to their custom status list.

create or replace function public.update_partner_portal_job_status(
  token_input text,
  job_id_input text,
  status_input text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  matched_partner record;
  matched_job record;
  allowed_statuses jsonb;
  is_allowed boolean := false;
  updated_data jsonb;
  now_iso text := to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
begin
  if coalesce(trim(job_id_input), '') = '' or coalesce(trim(status_input), '') = '' then
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

  allowed_statuses := coalesce(matched_partner.data->'partnerJobStatuses', '[]'::jsonb);
  select exists (
    select 1 from jsonb_array_elements_text(allowed_statuses) s
    where s = status_input
  ) into is_allowed;

  -- Accept/reject are primary response actions, not partner-configured
  -- progress statuses. Keep them available even when the custom status list
  -- only contains in_progress/ready/etc.
  if status_input in ('accepted', 'cancelled') then
    is_allowed := true;
  end if;

  if not is_allowed then
    raise exception 'Status not allowed for this partner';
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

  if status_input in ('accepted', 'cancelled') and coalesce(matched_job.data->>'status', '') <> 'sent' then
    raise exception 'This job has already been responded to';
  end if;

  updated_data := matched_job.data || jsonb_build_object('status', status_input);
  if status_input = 'ready' then
    updated_data := updated_data || jsonb_build_object('readyAt', now_iso);
  elsif status_input in ('accepted', 'in_progress') and coalesce(matched_job.data->>'acceptedAt', '') = '' then
    updated_data := updated_data || jsonb_build_object('acceptedAt', now_iso);
  elsif status_input = 'cancelled' then
    updated_data := updated_data || jsonb_build_object('rejectedAt', now_iso);
  end if;

  update public.partner_jobs
  set data = updated_data, updated_at = now()
  where id = matched_job.id and business_id = matched_job.business_id;

  return updated_data;
end;
$$;

grant execute on function public.update_partner_portal_job_status(text, text, text) to anon;
grant execute on function public.update_partner_portal_job_status(text, text, text) to authenticated;
