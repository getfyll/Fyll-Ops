-- Replay the latest order milestone celebration from Settings (owners and admins only).
-- Read-only: unlike get_pending_milestone it ignores celebrated_at and never changes any row.

create or replace function public.get_latest_milestone(business_id_input text)
returns table (milestone integer, total_orders integer, next_milestone integer)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  latest integer;
  total integer;
begin
  if auth.uid() is null or not public.is_business_admin(business_id_input) then
    return;
  end if;

  select max(m.milestone) into latest
  from public.business_milestones m
  where m.business_id = business_id_input;

  if latest is null then
    return;
  end if;

  total := greatest(public.count_milestone_orders(business_id_input), latest);
  return query select latest, total, public.next_milestone(total);
end;
$$;

revoke all on function public.get_latest_milestone(text) from public;
grant execute on function public.get_latest_milestone(text) to authenticated;
