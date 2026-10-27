-- Fyll Checkout step 1: save the customer's contact + delivery details BEFORE they see the
-- bank account, so the seller has the contact even if the customer never uploads a receipt.
-- Same guard as submit_social_checkout_payment: only while the link is awaiting payment and
-- not expired. It never changes the status.

create or replace function public.save_social_checkout_details(
  code_input text,
  customer_name_input text,
  customer_phone_input text,
  customer_email_input text,
  delivery_address_input text,
  delivery_state_input text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  matched record;
begin
  select id, business_id, data into matched
  from public.social_checkouts
  where id = code_input
    and data->>'status' = 'awaiting_payment';

  if matched.id is null then
    return jsonb_build_object('ok', false, 'error', 'not_found_or_already_submitted');
  end if;

  if (matched.data->>'expiresAt') is not null
    and (matched.data->>'expiresAt')::timestamptz < now()
  then
    return jsonb_build_object('ok', false, 'error', 'expired');
  end if;

  update public.social_checkouts
  set data = matched.data || jsonb_build_object(
        'customerName', customer_name_input,
        'customerPhone', customer_phone_input,
        'customerEmail', customer_email_input,
        'deliveryAddress', delivery_address_input,
        'deliveryState', delivery_state_input,
        'detailsSavedAt', to_jsonb(now()),
        'updatedAt', to_jsonb(now())
      ),
      updated_at = now()
  where id = code_input and business_id = matched.business_id;

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.save_social_checkout_details(text, text, text, text, text, text) to anon;
grant execute on function public.save_social_checkout_details(text, text, text, text, text, text) to authenticated;
