-- Lock down who can run the order-milestone functions.
-- Supabase grants EXECUTE on every new public function to anon and authenticated by default, and
-- "revoke ... from public" does not remove those. These were therefore callable by signed-out visitors:
-- count_milestone_orders (returned any business's order count) and record_business_milestones (no auth check).

-- Internal helpers: only the database itself (the trigger and the other functions, which run as owner) uses them.
revoke all on function public.count_milestone_orders(text) from public, anon, authenticated;
revoke all on function public.record_business_milestones(text, text) from public, anon, authenticated;
revoke all on function public.orders_milestone_trigger() from public, anon, authenticated;
revoke all on function public.is_business_admin(text) from public, anon, authenticated;

-- Used by the app: signed-in users only (each one also checks the caller is an admin of that business).
revoke all on function public.get_pending_milestone(text) from public, anon;
revoke all on function public.get_latest_milestone(text) from public, anon;
revoke all on function public.acknowledge_milestones(text, integer) from public, anon;
revoke all on function public.mark_milestone_shared(text, integer) from public, anon;
grant execute on function public.get_pending_milestone(text) to authenticated;
grant execute on function public.get_latest_milestone(text) to authenticated;
grant execute on function public.acknowledge_milestones(text, integer) to authenticated;
grant execute on function public.mark_milestone_shared(text, integer) to authenticated;

-- The storefront badge stays public on purpose (it only returns a number, and only when the seller turned it on).
grant execute on function public.get_public_milestone_badge(text) to anon, authenticated;
