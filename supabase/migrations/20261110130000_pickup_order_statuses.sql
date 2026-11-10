-- Pickup statuses: "Ready for pickup" and "Collected by customer".
--
-- The Fyll Store reads order statuses by name and stage, so these two must keep matching:
--   Ready for pickup       trackingStage 'out-for-delivery'   name matches /ready.*pick[ -]?up/i
--   Collected by customer  trackingStage 'delivered'          name matches /collected|collection/i
-- "Completed" stays the final step for every order.
--
-- Two parts, both safe to run more than once:
--   1) Existing businesses: add each status ONLY where the business has none like it. Nothing a merchant already has is
--      renamed, removed or renumbered. A new status goes next to its neighbour only if the slot right after it is free,
--      otherwise it is appended at the end (highest order + 1).
--   2) New businesses: patch the LIVE definition of public.seed_defaults_on_business_create() so new businesses get the
--      default order  Payment approval, Payment confirmed, Preparing, Ready for pickup, Out for delivery, Delivered,
--      Collected by customer, Completed.  The function is read from the database and edited in place (it is never
--      re-created from a pasted copy, because the live copy has drifted from the repo). If the function cannot be
--      patched safely this part stops with a notice and changes nothing.
--
-- `appliesTo` ('pickup') limits these two statuses to pickup orders in the status pickers. It is optional: a status without
-- it is offered for every order.

-- ---------------------------------------------------------------------------------------------------------------
-- 1) Existing businesses
-- ---------------------------------------------------------------------------------------------------------------
do $$
declare
  biz record;
  max_order numeric;
  candidate numeric;
  anchor_order numeric;
  has_ready boolean;
  has_collected boolean;
  chosen numeric;
  appended numeric;
begin
  for biz in
    select b.id::text as business_id, b.owner_id::text as owner_id
    from public.businesses b
    -- Only businesses that already have statuses. A business with none is left to the default seeding.
    where exists (select 1 from public.order_statuses os where os.business_id::text = b.id::text)
  loop
    select coalesce(max(case when (os.data->>'order') ~ '^[0-9]+(\.[0-9]+)?$' then (os.data->>'order')::numeric end), 0)
      into max_order
      from public.order_statuses os
     where os.business_id::text = biz.business_id;
    appended := floor(max_order);

    select exists (
      select 1 from public.order_statuses os
       where os.business_id::text = biz.business_id
         and (os.id = 'order-status-ready-for-pickup' or coalesce(os.data->>'name', '') ~* 'ready.*pick[ -]?up')
    ) into has_ready;

    select exists (
      select 1 from public.order_statuses os
       where os.business_id::text = biz.business_id
         and (os.id = 'order-status-collected-by-customer' or coalesce(os.data->>'name', '') ~* 'collected|collection')
    ) into has_collected;

    if not has_ready then
      -- Next to "Preparing" when the slot right after it is free, otherwise at the end.
      select case when (os.data->>'order') ~ '^[0-9]+(\.[0-9]+)?$' then (os.data->>'order')::numeric end into anchor_order
        from public.order_statuses os
       where os.business_id::text = biz.business_id and os.id = 'order-status-preparing'
       limit 1;
      chosen := null;
      if anchor_order is not null then
        candidate := floor(anchor_order) + 1;
        if not exists (
          select 1 from public.order_statuses os
           where os.business_id::text = biz.business_id
             and case when (os.data->>'order') ~ '^[0-9]+(\.[0-9]+)?$' then (os.data->>'order')::numeric end = candidate
        ) then
          chosen := candidate;
        end if;
      end if;
      if chosen is null then
        appended := appended + 1;
        chosen := appended;
      end if;
      insert into public.order_statuses (id, business_id, data, created_by, created_at, updated_at)
      values (
        'order-status-ready-for-pickup', biz.business_id,
        jsonb_build_object('id', 'order-status-ready-for-pickup', 'name', 'Ready for pickup', 'color', '#06B6D4',
                           'order', chosen, 'trackingStage', 'out-for-delivery', 'appliesTo', 'pickup'),
        biz.owner_id, now(), now()
      )
      on conflict (id, business_id) do nothing;
    end if;

    if not has_collected then
      -- Next to "Delivered" when the slot right after it is free, otherwise at the end.
      select case when (os.data->>'order') ~ '^[0-9]+(\.[0-9]+)?$' then (os.data->>'order')::numeric end into anchor_order
        from public.order_statuses os
       where os.business_id::text = biz.business_id and os.id = 'order-status-delivered'
       limit 1;
      chosen := null;
      if anchor_order is not null then
        candidate := floor(anchor_order) + 1;
        if not exists (
          select 1 from public.order_statuses os
           where os.business_id::text = biz.business_id
             and case when (os.data->>'order') ~ '^[0-9]+(\.[0-9]+)?$' then (os.data->>'order')::numeric end = candidate
        ) then
          chosen := candidate;
        end if;
      end if;
      if chosen is null then
        appended := appended + 1;
        chosen := appended;
      end if;
      insert into public.order_statuses (id, business_id, data, created_by, created_at, updated_at)
      values (
        'order-status-collected-by-customer', biz.business_id,
        jsonb_build_object('id', 'order-status-collected-by-customer', 'name', 'Collected by customer', 'color', '#0D9488',
                           'order', chosen, 'trackingStage', 'delivered', 'appliesTo', 'pickup'),
        biz.owner_id, now(), now()
      )
      on conflict (id, business_id) do nothing;
    end if;
  end loop;
end
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- 2) New businesses: patch the live seed function in place
-- ---------------------------------------------------------------------------------------------------------------
do $$
declare
  def text;
  marker constant text := 'return new;';
  start_from int := 1;
  pos int;
  last_pos int := 0;
  block text;
begin
  select pg_get_functiondef(p.oid)
    into def
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'seed_defaults_on_business_create'
   limit 1;

  if def is null then
    raise notice 'seed_defaults_on_business_create() was not found: nothing patched.';
    return;
  end if;
  if position('order-status-ready-for-pickup' in def) > 0 then
    raise notice 'seed_defaults_on_business_create() already seeds the pickup statuses: nothing to do.';
    return;
  end if;

  -- Find the LAST "return new;" (the one at the end of the function body).
  loop
    pos := strpos(substr(def, start_from), marker);
    exit when pos = 0;
    last_pos := start_from + pos - 1;
    start_from := last_pos + length(marker);
  end loop;
  if last_pos = 0 then
    raise notice 'seed_defaults_on_business_create() has no "return new;": not patched.';
    return;
  end if;

  block := $patch$
  -- Pickup statuses (added by 20261110130000_pickup_order_statuses.sql). Runs after the standard statuses are seeded.
  -- A brand-new business is renumbered into the default order Payment approval, Payment confirmed, Preparing,
  -- Ready for pickup, Out for delivery, Delivered, Collected by customer, Completed. Only untouched default rows move.
  update public.order_statuses os
     set data = jsonb_set(os.data, '{order}', to_jsonb(5)) || jsonb_build_object('appliesTo', 'delivery')
   where os.business_id::text = new.id::text and os.id = 'order-status-out-for-delivery' and os.data->>'order' = '4';
  update public.order_statuses os
     set data = jsonb_set(os.data, '{order}', to_jsonb(6)) || jsonb_build_object('appliesTo', 'delivery')
   where os.business_id::text = new.id::text and os.id = 'order-status-delivered' and os.data->>'order' = '5';
  update public.order_statuses os
     set data = jsonb_set(os.data, '{order}', to_jsonb(8))
   where os.business_id::text = new.id::text and os.id = 'order-status-completed' and os.data->>'order' = '6';

  insert into public.order_statuses (id, business_id, data, created_by, created_at, updated_at)
  select s.id, new.id::text, s.data, new.owner_id::text, now(), now()
    from (
      values
        ('order-status-ready-for-pickup',
         jsonb_build_object('id', 'order-status-ready-for-pickup', 'name', 'Ready for pickup', 'color', '#06B6D4',
                            'order', 4, 'trackingStage', 'out-for-delivery', 'appliesTo', 'pickup')),
        ('order-status-collected-by-customer',
         jsonb_build_object('id', 'order-status-collected-by-customer', 'name', 'Collected by customer', 'color', '#0D9488',
                            'order', 7, 'trackingStage', 'delivered', 'appliesTo', 'pickup'))
    ) as s(id, data)
   where exists (
           select 1 from public.order_statuses os
            where os.business_id::text = new.id::text and os.id = 'order-status-preparing'
         )
     and not exists (
           select 1 from public.order_statuses os
            where os.business_id::text = new.id::text
              and (os.id = s.id
                   or coalesce(os.data->>'name', '') ~* case when s.id = 'order-status-ready-for-pickup'
                                                              then 'ready.*pick[ -]?up' else 'collected|collection' end)
         )
  on conflict (id, business_id) do nothing;

  $patch$;

  def := substr(def, 1, last_pos - 1) || block || substr(def, last_pos);
  execute def;
  raise notice 'seed_defaults_on_business_create() now seeds the pickup statuses for new businesses.';
end
$$;
