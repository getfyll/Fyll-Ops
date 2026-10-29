-- Business name / storefront handle change requests, saved so the Fyll console can show and approve them.
-- Until now the request was only emailed to Fyll support (send-change-request), so it never appeared in the console.
--
-- - Rows are written by the send-change-request edge function (service role).
-- - The table has RLS on and no policies, so nothing reads it directly. The console uses the two functions below,
--   which only run for platform admins and reuse the console's own name / handle updates when approving.

create table if not exists public.business_change_requests (
  id uuid primary key default gen_random_uuid(),
  business_id text not null,
  kind text not null check (kind in ('business_name', 'storefront_handle')),
  current_value text,
  requested_value text not null,
  note text,
  requester_user_id uuid,
  requester_name text,
  requester_email text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'declined')),
  resolved_by text,
  resolved_at timestamptz,
  resolution_note text,
  created_at timestamptz not null default now()
);

create index if not exists business_change_requests_status_idx
  on public.business_change_requests (status, created_at desc);

alter table public.business_change_requests enable row level security;

create or replace function public.platform_admin_list_change_requests(status_input text default 'pending')
returns table (
  id uuid,
  business_id text,
  business_name text,
  kind text,
  current_value text,
  requested_value text,
  note text,
  requester_name text,
  requester_email text,
  status text,
  resolved_by text,
  resolved_at timestamptz,
  resolution_note text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'Platform admin access required';
  end if;

  return query
  select r.id, r.business_id,
         coalesce(nullif(trim(coalesce(b.data->>'businessName', '')), ''), b.name, r.business_id) as business_name,
         r.kind, r.current_value, r.requested_value, r.note, r.requester_name, r.requester_email,
         r.status, r.resolved_by, r.resolved_at, r.resolution_note, r.created_at
  from public.business_change_requests r
  left join public.businesses b on b.id::text = r.business_id
  where status_input is null or status_input = 'all' or r.status = status_input
  order by (r.status = 'pending') desc, r.created_at desc
  limit 200;
end;
$$;

-- Approve applies the change with the same functions the console's pencil icons use, then marks the request done.
-- Decline only marks it. A request that is already resolved cannot be resolved twice.
create or replace function public.platform_admin_resolve_change_request(
  request_id_input uuid,
  approve_input boolean,
  note_input text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  req public.business_change_requests%rowtype;
  applied jsonb := '{}'::jsonb;
  resolver text := coalesce(nullif(auth.jwt() ->> 'email', ''), 'platform admin');
begin
  if not public.is_platform_admin() then
    raise exception 'Platform admin access required';
  end if;

  select * into req from public.business_change_requests where id = request_id_input for update;
  if not found then
    raise exception 'Request not found';
  end if;
  if req.status <> 'pending' then
    raise exception 'This request was already %', req.status;
  end if;

  if approve_input then
    if req.kind = 'storefront_handle' then
      applied := public.platform_admin_update_storefront_handle(req.business_id, req.requested_value);
    else
      applied := public.platform_admin_update_business_name(req.business_id, req.requested_value, null::text);
    end if;
  end if;

  update public.business_change_requests
  set status = case when approve_input then 'approved' else 'declined' end,
      resolved_by = resolver,
      resolved_at = now(),
      resolution_note = nullif(trim(coalesce(note_input, '')), '')
  where id = req.id;

  return jsonb_build_object('status', case when approve_input then 'approved' else 'declined' end, 'applied', applied);
end;
$$;

revoke all on function public.platform_admin_list_change_requests(text) from public;
revoke all on function public.platform_admin_resolve_change_request(uuid, boolean, text) from public;
grant execute on function public.platform_admin_list_change_requests(text) to authenticated;
grant execute on function public.platform_admin_resolve_change_request(uuid, boolean, text) to authenticated;
