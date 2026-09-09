-- Include submitted customer details in the public social checkout lookup so
-- paid/verified checkout links can show more than just the payment reference.

create or replace function public.get_social_checkout_public(code_input text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  matched record;
  matched_business record;
begin
  select id, business_id, data into matched
  from public.social_checkouts
  where id = code_input;

  if matched.id is null then
    return null;
  end if;

  select name, data into matched_business
  from public.businesses
  where id = matched.business_id;

  return jsonb_build_object(
    'businessId', matched.business_id,
    'businessName', coalesce(nullif(trim(coalesce(matched_business.data->>'businessName', '')), ''), matched_business.name, 'Fyll'),
    'businessLogo', matched_business.data->>'businessLogo',
    'status', case
      when matched.data->>'status' = 'awaiting_payment'
        and (matched.data->>'expiresAt') is not null
        and (matched.data->>'expiresAt')::timestamptz < now()
      then 'expired'
      else matched.data->>'status'
    end,
    'amount', matched.data->'amount',
    'billNote', matched.data->'billNote',
    'bankAccount', matched.data->'bankAccount',
    'expiresAt', matched.data->'expiresAt',
    'customerName', matched.data->>'customerName',
    'customerPhone', matched.data->>'customerPhone',
    'customerEmail', matched.data->>'customerEmail',
    'deliveryAddress', matched.data->>'deliveryAddress',
    'deliveryState', matched.data->>'deliveryState'
  );
end;
$$;

grant execute on function public.get_social_checkout_public(text) to anon;
grant execute on function public.get_social_checkout_public(text) to authenticated;
