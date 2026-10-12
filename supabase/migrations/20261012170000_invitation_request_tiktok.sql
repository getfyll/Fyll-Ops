-- Invitation requests: also ask for a TikTok handle (the form now asks "Are you on Instagram or
-- TikTok?" and the person can pick both).

alter table public.invitation_requests
  add column if not exists tiktok_handle text;

-- Replace the function with one that takes the extra argument. The old signature goes away so a call
-- with named arguments never matches two overloads; callers that do not send tiktok_handle_input
-- keep working because it defaults to null.
drop function if exists public.submit_invitation_request(text, text, text, text, boolean, boolean, boolean, text);

create or replace function public.submit_invitation_request(
  full_name_input text,
  email_input text,
  business_name_input text,
  message_input text,
  refund_policy_input boolean,
  return_policy_input boolean,
  delivery_policy_input boolean,
  instagram_handle_input text default null,
  tiktok_handle_input text default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
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
    refund_policy, return_policy, delivery_policy, instagram_handle, tiktok_handle
  )
  values (
    trim(full_name_input),
    lower(trim(email_input)),
    trim(business_name_input),
    trim(message_input),
    refund_policy_input,
    return_policy_input,
    delivery_policy_input,
    nullif(trim(instagram_handle_input), ''),
    nullif(trim(tiktok_handle_input), '')
  )
  returning id into new_id;

  return new_id;
end;
$function$;

grant execute on function public.submit_invitation_request(text, text, text, text, boolean, boolean, boolean, text, text) to anon, authenticated;
