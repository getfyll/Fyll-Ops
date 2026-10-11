-- Quotes: a priced offer sent to a customer for approval before any order exists.
-- Staff create a quote, the customer opens a link, accepts / asks for changes / declines,
-- pays the deposit and uploads a screenshot; staff verify it and create the order.
--
-- Same pattern as social_checkouts: a staff-only table (RLS via can_access_business) and a few
-- SECURITY DEFINER RPCs that are the only way an anonymous customer can touch a quote. The quote
-- code (10 random chars) is the access credential. The public RPCs never return costs or margin.

create table if not exists public.quotes (
  id text not null,
  business_id text not null,
  data jsonb not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  primary key (id, business_id)
);

create index if not exists quotes_business_id_idx on public.quotes (business_id);

alter table public.quotes enable row level security;

drop policy if exists quotes_select_own_business on public.quotes;
drop policy if exists quotes_insert_own_business on public.quotes;
drop policy if exists quotes_update_own_business on public.quotes;
drop policy if exists quotes_delete_own_business on public.quotes;

create policy quotes_select_own_business
  on public.quotes for select
  using (public.can_access_business(business_id));

create policy quotes_insert_own_business
  on public.quotes for insert
  with check (public.can_access_business(business_id));

create policy quotes_update_own_business
  on public.quotes for update
  using (public.can_access_business(business_id))
  with check (public.can_access_business(business_id));

create policy quotes_delete_own_business
  on public.quotes for delete
  using (public.can_access_business(business_id));

-- Appends one entry to a quote's activity trail.
create or replace function public.quote_activity_entry(text_input text, tone_input text)
returns jsonb
language sql
immutable
as $$
  select jsonb_build_object(
    'id', md5(random()::text || clock_timestamp()::text),
    'text', text_input,
    'tone', tone_input,
    'at', to_jsonb(now())
  );
$$;

-- What the customer's page needs, and nothing more (no costs, no staff names).
create or replace function public.get_quote_public(code_input text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  matched record;
  matched_business record;
  effective_status text;
  last_viewed timestamptz;
  new_data jsonb;
begin
  select id, business_id, data into matched
  from public.quotes
  where id = upper(trim(code_input));

  if matched.id is null then
    return null;
  end if;

  select name, data into matched_business
  from public.businesses
  where id = matched.business_id;

  effective_status := matched.data->>'status';
  if effective_status in ('sent', 'changes_requested')
    and nullif(matched.data->>'validUntil', '') is not null
    and (matched.data->>'validUntil')::timestamptz < now()
  then
    effective_status := 'expired';
  end if;

  -- Count the view; only add an activity line if the last view was a while ago.
  last_viewed := nullif(matched.data->>'lastViewedAt', '')::timestamptz;
  new_data := matched.data || jsonb_build_object(
    'viewCount', coalesce((matched.data->>'viewCount')::int, 0) + 1,
    'lastViewedAt', to_jsonb(now())
  );
  if last_viewed is null or last_viewed < now() - interval '30 minutes' then
    new_data := new_data || jsonb_build_object(
      'activity',
      coalesce(matched.data->'activity', '[]'::jsonb)
        || public.quote_activity_entry(
          'Viewed by ' || coalesce(nullif(split_part(matched.data->>'customerName', ' ', 1), ''), 'the customer'),
          'neutral'
        )
    );
  end if;
  update public.quotes
  set data = new_data
  where id = matched.id and business_id = matched.business_id;

  return jsonb_build_object(
    'businessName', coalesce(nullif(trim(coalesce(matched_business.data->>'businessName', '')), ''), matched_business.name, 'Fyll'),
    'businessLogo', matched_business.data->>'businessLogo',
    'businessPhone', matched_business.data->>'businessPhone',
    'quoteNumber', matched.data->>'quoteNumber',
    'status', effective_status,
    'customerName', matched.data->>'customerName',
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'name', item->>'name',
        'quantity', coalesce((item->>'quantity')::numeric, 1),
        'unitPrice', coalesce((item->>'unitPrice')::numeric, 0)
      ))
      from jsonb_array_elements(coalesce(matched.data->'items', '[]'::jsonb)) as item
    ), '[]'::jsonb),
    'total', matched.data->'total',
    'depositPercent', matched.data->'depositPercent',
    'depositAmount', matched.data->'depositAmount',
    'balance', matched.data->'balance',
    'validUntil', matched.data->'validUntil',
    'readyIn', matched.data->'readyIn',
    'note', matched.data->'note',
    'bankAccount', case
      when effective_status in ('accepted', 'proof_submitted', 'proof_rejected', 'order_created')
      then matched.data->'bankAccount'
      else null
    end,
    'proofRejected', effective_status = 'proof_rejected'
  );
end;
$$;

grant execute on function public.get_quote_public(text) to anon, authenticated;

-- The customer's answer: accept, decline, ask for changes, or reopen a declined quote.
create or replace function public.respond_quote_public(
  code_input text,
  action_input text,
  message_input text default null,
  topics_input jsonb default null,
  reason_input text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  matched record;
  current_status text;
  customer_first text;
  new_data jsonb;
  activity jsonb;
begin
  select id, business_id, data into matched
  from public.quotes
  where id = upper(trim(code_input));

  if matched.id is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  current_status := matched.data->>'status';
  customer_first := coalesce(nullif(split_part(matched.data->>'customerName', ' ', 1), ''), 'The customer');
  activity := coalesce(matched.data->'activity', '[]'::jsonb);

  if current_status in ('sent', 'changes_requested')
    and nullif(matched.data->>'validUntil', '') is not null
    and (matched.data->>'validUntil')::timestamptz < now()
  then
    return jsonb_build_object('ok', false, 'error', 'expired');
  end if;

  if action_input = 'accept' and current_status in ('sent', 'changes_requested') then
    new_data := matched.data || jsonb_build_object(
      'status', 'accepted',
      'acceptedAt', to_jsonb(now()),
      'activity', activity || public.quote_activity_entry('Quote accepted by ' || customer_first, 'good')
    );
  elsif action_input = 'request_changes' and current_status = 'sent' then
    new_data := matched.data || jsonb_build_object(
      'status', 'changes_requested',
      'changesRequest', jsonb_build_object(
        'message', left(coalesce(message_input, ''), 1000),
        'topics', coalesce(topics_input, '[]'::jsonb),
        'at', to_jsonb(now())
      ),
      'activity', activity || public.quote_activity_entry('Changes requested by ' || customer_first, 'warn')
    );
  elsif action_input = 'decline' and current_status in ('sent', 'changes_requested') then
    new_data := matched.data || jsonb_build_object(
      'status', 'declined',
      'declineReason', left(coalesce(reason_input, ''), 200),
      'activity', activity || public.quote_activity_entry(
        'Quote declined by ' || customer_first
          || case when coalesce(reason_input, '') <> '' then ' (' || left(reason_input, 200) || ')' else '' end,
        'bad'
      )
    );
  elsif action_input = 'reopen' and current_status = 'declined' then
    new_data := matched.data || jsonb_build_object(
      'status', 'sent',
      'activity', activity || public.quote_activity_entry(customer_first || ' reopened the quote', 'neutral')
    );
  else
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;

  new_data := new_data || jsonb_build_object('updatedAt', to_jsonb(now()));
  update public.quotes
  set data = new_data, updated_at = now()
  where id = matched.id and business_id = matched.business_id;

  return jsonb_build_object('ok', true, 'status', new_data->>'status');
end;
$$;

grant execute on function public.respond_quote_public(text, text, text, jsonb, text) to anon, authenticated;

-- The customer's deposit screenshot, accepted only while the quote is waiting for one.
create or replace function public.submit_quote_proof(code_input text, proof_url_input text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  matched record;
  new_data jsonb;
begin
  if proof_url_input is null or proof_url_input !~ '^https://' or length(proof_url_input) > 1000 then
    return jsonb_build_object('ok', false, 'error', 'invalid_proof');
  end if;

  select id, business_id, data into matched
  from public.quotes
  where id = upper(trim(code_input))
    and data->>'status' in ('accepted', 'proof_rejected');

  if matched.id is null then
    return jsonb_build_object('ok', false, 'error', 'not_found_or_already_submitted');
  end if;

  new_data := matched.data || jsonb_build_object(
    'status', 'proof_submitted',
    'proofImageUrl', proof_url_input,
    'submittedAt', to_jsonb(now()),
    'updatedAt', to_jsonb(now()),
    'activity', coalesce(matched.data->'activity', '[]'::jsonb)
      || public.quote_activity_entry('Deposit proof uploaded', 'good')
  );

  update public.quotes
  set data = new_data, updated_at = now()
  where id = matched.id and business_id = matched.business_id;

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.submit_quote_proof(text, text) to anon, authenticated;
