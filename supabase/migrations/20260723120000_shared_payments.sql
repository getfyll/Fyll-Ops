-- Shared payment records for Fyll app, Fyll Storefront, and other payment flows.
-- Storefront checkout backends should create exactly one row per storefront
-- order using idempotency_key = storefront:{business_id}:{source_order_id}.

create extension if not exists pgcrypto;

create or replace function public.can_access_business(target_business_id text)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  has_access boolean := false;
begin
  if auth.uid() is null or coalesce(trim(target_business_id), '') = '' then
    return false;
  end if;

  if to_regclass('public.profiles') is not null then
    execute
      'select exists (
        select 1
        from public.profiles
        where id::text = $1
          and business_id::text = $2
      )'
      into has_access
      using auth.uid()::text, target_business_id;

    if has_access then
      return true;
    end if;
  end if;

  if to_regclass('public.team_members') is not null then
    execute
      'select exists (
        select 1
        from public.team_members
        where user_id::text = $1
          and business_id::text = $2
      )'
      into has_access
      using auth.uid()::text, target_business_id;

    if has_access then
      return true;
    end if;
  end if;

  return false;
end;
$$;

create table if not exists public.payments (
  id text not null,
  business_id text not null,
  data jsonb not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.payments drop constraint if exists payments_pkey;
alter table public.payments add primary key (id, business_id);

create index if not exists payments_business_id_idx
  on public.payments (business_id);

create index if not exists payments_business_source_idx
  on public.payments (business_id, ((data->>'source')));

create unique index if not exists payments_storefront_source_order_unique_idx
  on public.payments (business_id, ((data->>'sourceOrderId')))
  where lower(coalesce(data->>'source', '')) = 'storefront'
    and coalesce(data->>'sourceOrderId', '') <> '';

alter table public.payments enable row level security;

drop policy if exists payments_select_own_business on public.payments;
drop policy if exists payments_insert_own_business on public.payments;
drop policy if exists payments_update_own_business on public.payments;
drop policy if exists payments_delete_own_business on public.payments;

create policy payments_select_own_business
  on public.payments for select
  using (public.can_access_business(business_id));

create policy payments_insert_own_business
  on public.payments for insert
  with check (public.can_access_business(business_id));

create policy payments_update_own_business
  on public.payments for update
  using (public.can_access_business(business_id))
  with check (public.can_access_business(business_id));

create policy payments_delete_own_business
  on public.payments for delete
  using (public.can_access_business(business_id));

comment on table public.payments is
  'Shared payment records. Fyll Storefront writes source=storefront rows here; Fyll app Payments reads this table.';

comment on column public.payments.data is
  'Expected keys: source, sourceOrderId, idempotencyKey, customerName, customerEmail, amount, currency, paymentMethod, status, proofUrl/paymentProofUrl, paymentLinkUrl, bankAccountId, bankAccount, createdAt, updatedAt. Storefront statuses: pending, proof_submitted, verified, confirmed, rejected, failed, refunded.';

drop function if exists public.upsert_storefront_payment(
  text,
  text,
  text,
  text,
  text,
  numeric,
  text,
  text,
  text,
  text,
  text,
  text
);

create or replace function public.upsert_storefront_payment(
  business_id_input text,
  source_order_id_input text,
  customer_name_input text,
  customer_email_input text default '',
  customer_phone_input text default '',
  amount_input numeric default 0,
  currency_input text default 'NGN',
  payment_method_input text default 'bank_transfer',
  status_input text default 'pending',
  proof_url_input text default null,
  payment_link_url_input text default null,
  idempotency_key_input text default null,
  bank_account_input jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  normalized_business_id text := trim(coalesce(business_id_input, ''));
  normalized_order_id text := trim(coalesce(source_order_id_input, ''));
  normalized_status text := lower(trim(coalesce(status_input, 'pending')));
  normalized_payment_method text := lower(trim(coalesce(payment_method_input, 'bank_transfer')));
  normalized_currency text := upper(trim(coalesce(currency_input, 'NGN')));
  normalized_idempotency_key text;
  existing_payment record;
  matched_order record;
  payment_id text;
  payment_data jsonb;
  normalized_bank_account jsonb := coalesce(bank_account_input, '{}'::jsonb);
  now_value timestamptz := now();
begin
  if normalized_business_id = '' or normalized_order_id = '' then
    return jsonb_build_object('ok', false, 'error', 'missing_business_or_order');
  end if;

  if amount_input is null or amount_input < 0 then
    return jsonb_build_object('ok', false, 'error', 'invalid_amount');
  end if;

  if normalized_status not in ('pending', 'proof_submitted', 'verified', 'confirmed', 'rejected', 'failed', 'refunded') then
    return jsonb_build_object('ok', false, 'error', 'invalid_status');
  end if;

  if normalized_payment_method not in ('bank_transfer', 'card', 'payment_link') then
    return jsonb_build_object('ok', false, 'error', 'invalid_payment_method');
  end if;

  select id, business_id, data
  into matched_order
  from public.orders
  where id = normalized_order_id
    and business_id = normalized_business_id
  limit 1;

  if matched_order.id is null then
    return jsonb_build_object('ok', false, 'error', 'order_not_found');
  end if;

  normalized_idempotency_key := coalesce(
    nullif(trim(coalesce(idempotency_key_input, '')), ''),
    'storefront:' || normalized_business_id || ':' || normalized_order_id
  );

  select id, business_id, data
  into existing_payment
  from public.payments
  where business_id = normalized_business_id
    and lower(coalesce(data->>'source', '')) = 'storefront'
    and (
      coalesce(data->>'sourceOrderId', '') = normalized_order_id
      or coalesce(data->>'idempotencyKey', '') = normalized_idempotency_key
    )
  order by coalesce(updated_at, created_at, 'epoch'::timestamptz) desc
  limit 1;

  payment_id := coalesce(existing_payment.id, 'pay_storefront_' || replace(gen_random_uuid()::text, '-', ''));

  if normalized_bank_account = '{}'::jsonb
     and to_regclass('public.payment_accounts') is not null then
    select jsonb_build_object(
      'id', pa.id,
      'bank', pa.data->>'bankName',
      'bankName', pa.data->>'bankName',
      'accountName', pa.data->>'accountName',
      'accountNumber', pa.data->>'accountNumber'
    )
    into normalized_bank_account
    from public.payment_accounts pa
    where pa.business_id = normalized_business_id
    order by case when lower(coalesce(pa.data->>'isDefault', 'false')) = 'true' then 1 else 0 end desc, pa.created_at asc
    limit 1;

    normalized_bank_account := coalesce(normalized_bank_account, '{}'::jsonb);
  end if;

  payment_data := coalesce(existing_payment.data, '{}'::jsonb)
    || jsonb_build_object(
      'id', payment_id,
      'businessId', normalized_business_id,
      'source', 'storefront',
      'sourceOrderId', normalized_order_id,
      'idempotencyKey', normalized_idempotency_key,
      'customerName', trim(coalesce(customer_name_input, '')),
      'customerEmail', trim(coalesce(customer_email_input, '')),
      'customerPhone', trim(coalesce(customer_phone_input, '')),
      'amount', amount_input,
      'currency', normalized_currency,
      'paymentMethod', normalized_payment_method,
      'status', normalized_status,
      'bankAccountId', normalized_bank_account->>'id',
      'bankAccount', normalized_bank_account,
      'updatedAt', to_jsonb(now_value)
    );

  if coalesce(existing_payment.data->>'createdAt', '') = '' then
    payment_data := payment_data || jsonb_build_object('createdAt', to_jsonb(now_value));
  end if;

  if proof_url_input is not null and trim(proof_url_input) <> '' then
    payment_data := payment_data || jsonb_build_object(
      'proofUrl', trim(proof_url_input),
      'paymentProofUrl', trim(proof_url_input)
    );
  end if;

  if payment_link_url_input is not null and trim(payment_link_url_input) <> '' then
    payment_data := payment_data || jsonb_build_object('paymentLinkUrl', trim(payment_link_url_input));
  end if;

  insert into public.payments (id, business_id, data, updated_at)
  values (payment_id, normalized_business_id, payment_data, now_value)
  on conflict (id, business_id)
  do update set
    data = excluded.data,
    updated_at = excluded.updated_at;

  return jsonb_build_object('ok', true, 'payment', payment_data);
end;
$$;

grant execute on function public.upsert_storefront_payment(
  text,
  text,
  text,
  text,
  text,
  numeric,
  text,
  text,
  text,
  text,
  text,
  text,
  jsonb
) to anon;

grant execute on function public.upsert_storefront_payment(
  text,
  text,
  text,
  text,
  text,
  numeric,
  text,
  text,
  text,
  text,
  text,
  text,
  jsonb
) to authenticated;

create or replace function public.update_storefront_payment_status(
  business_id_input text,
  payment_id_input text,
  status_input text,
  proof_url_input text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  normalized_business_id text := trim(coalesce(business_id_input, ''));
  normalized_payment_id text := trim(coalesce(payment_id_input, ''));
  normalized_status text := lower(trim(coalesce(status_input, '')));
  matched_payment record;
  payment_data jsonb;
  now_value timestamptz := now();
begin
  if normalized_business_id = '' or normalized_payment_id = '' then
    return jsonb_build_object('ok', false, 'error', 'missing_business_or_payment');
  end if;

  if normalized_status not in ('pending', 'proof_submitted', 'verified', 'confirmed', 'rejected', 'failed', 'refunded') then
    return jsonb_build_object('ok', false, 'error', 'invalid_status');
  end if;

  select id, business_id, data
  into matched_payment
  from public.payments
  where id = normalized_payment_id
    and business_id = normalized_business_id
    and lower(coalesce(data->>'source', '')) = 'storefront'
  limit 1;

  if matched_payment.id is null then
    return jsonb_build_object('ok', false, 'error', 'payment_not_found');
  end if;

  payment_data := matched_payment.data
    || jsonb_build_object(
      'status', normalized_status,
      'updatedAt', to_jsonb(now_value)
    );

  if proof_url_input is not null and trim(proof_url_input) <> '' then
    payment_data := payment_data || jsonb_build_object(
      'proofUrl', trim(proof_url_input),
      'paymentProofUrl', trim(proof_url_input)
    );
  end if;

  update public.payments
  set data = payment_data,
      updated_at = now_value
  where id = normalized_payment_id
    and business_id = normalized_business_id;

  return jsonb_build_object('ok', true, 'payment', payment_data);
end;
$$;

grant execute on function public.update_storefront_payment_status(text, text, text, text) to anon;
grant execute on function public.update_storefront_payment_status(text, text, text, text) to authenticated;
