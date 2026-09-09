-- ==================================================================
-- INVITATION REQUESTS — PUBLIC "REQUEST ACCESS" FORM
-- ==================================================================
-- Stores submissions from the public fyll.app "Request an Invitation"
-- form. RLS is enabled with no direct policies, so all writes go through
-- submit_invitation_request() below (security definer). Reads are
-- restricted to service_role, which bypasses RLS.
-- ==================================================================

create table if not exists public.invitation_requests (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  email text not null,
  business_name text not null,
  message text not null,
  refund_policy boolean not null,
  return_policy boolean not null,
  delivery_policy boolean not null,
  instagram_handle text,
  status text not null default 'pending',
  created_at timestamptz not null default now()
);

create index if not exists invitation_requests_created_at_idx on public.invitation_requests (created_at desc);

alter table public.invitation_requests enable row level security;

drop function if exists public.submit_invitation_request(text, text, text, text, text, text, text, text);

create or replace function public.submit_invitation_request(
  full_name_input text,
  email_input text,
  business_name_input text,
  message_input text,
  refund_policy_input boolean,
  return_policy_input boolean,
  delivery_policy_input boolean,
  instagram_handle_input text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_id uuid;
begin
  if coalesce(trim(full_name_input), '') = '' then
    raise exception 'Full name is required';
  end if;

  if coalesce(trim(email_input), '') = '' or position('@' in email_input) = 0 then
    raise exception 'A valid email is required';
  end if;

  if coalesce(trim(business_name_input), '') = '' then
    raise exception 'Business name is required';
  end if;

  if coalesce(trim(message_input), '') = '' then
    raise exception 'A message is required';
  end if;

  if refund_policy_input is null or return_policy_input is null or delivery_policy_input is null then
    raise exception 'Refund, return, and delivery policy answers are required';
  end if;

  insert into public.invitation_requests (
    full_name, email, business_name, message,
    refund_policy, return_policy, delivery_policy, instagram_handle
  )
  values (
    trim(full_name_input),
    lower(trim(email_input)),
    trim(business_name_input),
    trim(message_input),
    refund_policy_input,
    return_policy_input,
    delivery_policy_input,
    nullif(trim(instagram_handle_input), '')
  )
  returning id into new_id;

  return new_id;
end;
$$;

grant execute on function public.submit_invitation_request(text, text, text, text, boolean, boolean, boolean, text) to anon;
grant execute on function public.submit_invitation_request(text, text, text, text, boolean, boolean, boolean, text) to authenticated;
