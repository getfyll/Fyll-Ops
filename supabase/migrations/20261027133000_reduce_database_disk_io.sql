-- Reduce avoidable database I/O identified from pg_stat_statements.
--
-- 1. Retain seven days of pg_cron run history. Supabase documents that
--    cron.job_run_details is never pruned automatically.
-- 2. Match indexes to the recycle-bin and notification list query shapes.
-- 3. Avoid rewriting businesses.data when feature access is unchanged.

create extension if not exists pg_cron with schema extensions;

select cron.unschedule('fyll-cron-history-cleanup')
where exists (
  select 1
  from cron.job
  where jobname = 'fyll-cron-history-cleanup'
);

select cron.schedule(
  'fyll-cron-history-cleanup',
  '0 0 * * *',
  $$delete from cron.job_run_details where end_time < now() - interval '7 days'$$
);

create index if not exists deleted_items_business_updated_id_idx
  on public.deleted_items (business_id, updated_at desc, id desc);

create index if not exists collaboration_notifications_business_created_idx
  on public.collaboration_notifications (business_id, created_at desc);

create or replace function public.platform_admin_update_business_feature_access(
  business_id_input text,
  feature_access_input jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  normalized_business_id text := trim(coalesce(business_id_input, ''));
  normalized_feature_access jsonb;
  current_feature_access jsonb;
begin
  if not public.is_platform_admin() then
    raise exception 'Platform admin access required';
  end if;

  normalized_feature_access := jsonb_build_object(
    'storefront', coalesce((feature_access_input->>'storefront')::boolean, true),
    'socialCheckout', coalesce((feature_access_input->>'socialCheckout')::boolean, true),
    'threads', coalesce((feature_access_input->>'threads')::boolean, true),
    'cases', coalesce((feature_access_input->>'cases')::boolean, true),
    'teamMembers', coalesce((feature_access_input->>'teamMembers')::boolean, true),
    'tasks', coalesce((feature_access_input->>'tasks')::boolean, true),
    'finance', coalesce((feature_access_input->>'finance')::boolean, true),
    'insights', coalesce((feature_access_input->>'insights')::boolean, true),
    'delivery', coalesce((feature_access_input->>'delivery')::boolean, true),
    'returns', coalesce((feature_access_input->>'returns')::boolean, true),
    'announcements', coalesce((feature_access_input->>'announcements')::boolean, true),
    'orderAutomation', coalesce((feature_access_input->>'orderAutomation')::boolean, true),
    'additionalIntegrations', coalesce((feature_access_input->>'additionalIntegrations')::boolean, false),
    'woocommerce', coalesce((feature_access_input->>'woocommerce')::boolean, false),
    'fyllPrint', coalesce((feature_access_input->>'fyllPrint')::boolean, true),
    'aiImport', coalesce((feature_access_input->>'aiImport')::boolean, true)
  );

  select data->'featureAccess'
  into current_feature_access
  from public.businesses
  where id::text = normalized_business_id;

  if not found then
    raise exception 'Business not found';
  end if;

  if current_feature_access is distinct from normalized_feature_access then
    update public.businesses
    set data = coalesce(data, '{}'::jsonb) || jsonb_build_object('featureAccess', normalized_feature_access)
    where id::text = normalized_business_id;
  end if;

  return normalized_feature_access;
end;
$$;

grant execute on function public.platform_admin_update_business_feature_access(text, jsonb) to authenticated;
