-- Order milestones: 100, 500, 1,000, 1,500, then every 500.
--
-- - business_milestones records each milestone a business has reached (once, forever). Rows are never removed,
--   so a later cancellation does not take a milestone back.
-- - A trigger on orders recounts on the server whenever an order BECOMES countable, under a per-business advisory
--   lock so two orders landing at once cannot skip or duplicate a milestone.
-- - The table has RLS on and no policies. The app only reads it through the functions below.
--
-- What counts as an order: every order in Fyll Ops (storefront, payment link, manual) that is confirmed or paid.
-- Not counted: cancelled, refunded, draft, unpaid (awaiting payment / payment approval / payment failed) and test
-- orders. Deleted orders are removed from public.orders, so they never count. One Fyll Checkout purchase can exist as
-- two orders (the checkout order and the website order); they share a checkout reference and count once.

create table if not exists public.business_milestones (
  business_id text not null,
  milestone integer not null check (milestone > 0),
  reached_at timestamptz not null default now(),
  order_id text,
  celebrated_at timestamptz,
  shared_at timestamptz,
  primary key (business_id, milestone)
);

create index if not exists business_milestones_uncelebrated_idx
  on public.business_milestones (business_id)
  where celebrated_at is null;

alter table public.business_milestones enable row level security;

-- The sequence, written once so it works forever.
create or replace function public.milestones_up_to(order_count integer)
returns setof integer
language sql
immutable
as $$
  select 100 where order_count >= 100
  union all
  select g from generate_series(500, greatest(order_count, 500), 500) as g where g <= order_count
  order by 1;
$$;

create or replace function public.next_milestone(order_count integer)
returns integer
language sql
immutable
as $$
  select case
    when order_count < 100 then 100
    when order_count < 500 then 500
    else (order_count / 500 + 1) * 500
  end;
$$;

create or replace function public.order_counts_toward_milestone(order_data jsonb)
returns boolean
language sql
immutable
as $$
  select
    lower(trim(coalesce(order_data->>'status', ''))) not in (
      '', 'draft',
      'cancelled', 'canceled',
      'refunded',
      'awaiting_payment', 'awaiting payment', 'pending payment', 'payment approval', 'payment failed'
    )
    and lower(coalesce(order_data->>'isTest', 'false')) <> 'true'
    and coalesce(order_data->>'orderNumber', '') not ilike 'FYL-DEMO%'
    and coalesce(order_data->'fyllCheckout'->>'reference', '') not ilike 'FYL-DEMO%';
$$;

create or replace function public.count_milestone_orders(target_business_id text)
returns integer
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select count(distinct coalesce(nullif(o.data->'fyllCheckout'->>'reference', ''), o.id))::integer
  from public.orders o
  where o.business_id = target_business_id
    and public.order_counts_toward_milestone(o.data);
$$;

create or replace function public.record_business_milestones(target_business_id text, crossing_order_id text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  total integer;
begin
  -- One recount at a time per business. The second order waits, then counts with the first one visible.
  perform pg_advisory_xact_lock(hashtextextended('business_milestones:' || target_business_id, 0));

  total := public.count_milestone_orders(target_business_id);

  insert into public.business_milestones (business_id, milestone, order_id)
  select target_business_id, m, crossing_order_id
  from public.milestones_up_to(total) as m
  on conflict (business_id, milestone) do nothing;
end;
$$;

create or replace function public.orders_milestone_trigger()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- Only when this write makes the order countable (new, or it just became confirmed / paid).
  if public.order_counts_toward_milestone(new.data)
     and (tg_op = 'INSERT' or not public.order_counts_toward_milestone(old.data)) then
    begin
      perform public.record_business_milestones(new.business_id, new.id);
    exception when others then
      -- A milestone problem must never block an order from being saved.
      raise warning 'milestone recount failed for %: %', new.business_id, sqlerrm;
    end;
  end if;
  return new;
end;
$$;

drop trigger if exists orders_milestone_trigger on public.orders;
create trigger orders_milestone_trigger
  after insert or update on public.orders
  for each row
  execute function public.orders_milestone_trigger();

-- One-time backfill. Milestones a business already passed are recorded as celebrated, except its current highest,
-- which is left to be celebrated once. The crossing order and date come from each purchase's position in time.
with counted as (
  select o.business_id,
         coalesce(nullif(o.data->'fyllCheckout'->>'reference', ''), o.id) as purchase,
         o.id,
         o.created_at
  from public.orders o
  where public.order_counts_toward_milestone(o.data)
),
first_per_purchase as (
  select distinct on (business_id, purchase) business_id, id, created_at
  from counted
  order by business_id, purchase, created_at, id
),
ranked as (
  select business_id, id, created_at,
         row_number() over (partition by business_id order by created_at, id) as rn
  from first_per_purchase
),
totals as (
  select business_id, max(rn)::integer as total from ranked group by business_id
)
insert into public.business_milestones (business_id, milestone, reached_at, order_id, celebrated_at)
select r.business_id,
       r.rn::integer,
       r.created_at,
       r.id,
       case when r.rn = (select max(m) from public.milestones_up_to(t.total) as m) then null else now() end
from ranked r
join totals t using (business_id)
where r.rn in (select m from public.milestones_up_to(t.total) as m)
on conflict (business_id, milestone) do nothing;

-- Owners and admins of a business (profile or team membership).
create or replace function public.is_business_admin(target_business_id text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and business_id = target_business_id and role = 'admin'
    union all
    select 1 from public.team_members
    where user_id = auth.uid() and business_id = target_business_id and role = 'admin'
  );
$$;

-- The highest milestone not yet celebrated, for owners and admins only. No row means nothing to show.
create or replace function public.get_pending_milestone(business_id_input text)
returns table (milestone integer, total_orders integer, next_milestone integer)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  pending integer;
  total integer;
begin
  if auth.uid() is null or not public.is_business_admin(business_id_input) then
    return;
  end if;

  select max(m.milestone) into pending
  from public.business_milestones m
  where m.business_id = business_id_input and m.celebrated_at is null;

  if pending is null then
    return;
  end if;

  total := greatest(public.count_milestone_orders(business_id_input), pending);
  return query select pending, total, public.next_milestone(total);
end;
$$;

-- Marks the shown milestone and everything below it as celebrated (several at once celebrate only the highest).
create or replace function public.acknowledge_milestones(business_id_input text, through_milestone integer)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null or not public.is_business_admin(business_id_input) then
    raise exception 'Not allowed';
  end if;

  update public.business_milestones
  set celebrated_at = now()
  where business_id = business_id_input
    and milestone <= through_milestone
    and celebrated_at is null;
end;
$$;

create or replace function public.mark_milestone_shared(business_id_input text, milestone_input integer)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null or not public.is_business_admin(business_id_input) then
    raise exception 'Not allowed';
  end if;

  update public.business_milestones
  set shared_at = coalesce(shared_at, now())
  where business_id = business_id_input and milestone = milestone_input;
end;
$$;

-- For the storefront badge: the highest milestone, but only when the seller switched it on and it is 100 or more.
create or replace function public.get_public_milestone_badge(business_id_input text)
returns integer
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select max(m.milestone)
  from public.business_milestones m
  join public.businesses b on b.id::text = m.business_id
  where m.business_id = business_id_input
    and m.milestone >= 100
    and lower(coalesce(b.data->>'showMilestoneOnStore', 'false')) = 'true';
$$;

revoke all on function public.record_business_milestones(text, text) from public;
revoke all on function public.count_milestone_orders(text) from public;
revoke all on function public.get_pending_milestone(text) from public;
revoke all on function public.acknowledge_milestones(text, integer) from public;
revoke all on function public.mark_milestone_shared(text, integer) from public;
revoke all on function public.is_business_admin(text) from public;
grant execute on function public.get_pending_milestone(text) to authenticated;
grant execute on function public.acknowledge_milestones(text, integer) to authenticated;
grant execute on function public.mark_milestone_shared(text, integer) to authenticated;
grant execute on function public.get_public_milestone_badge(text) to anon, authenticated;
