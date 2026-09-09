-- Auto-create a business, profile, and team row whenever a new auth user is created.
-- Safe to run multiple times.
drop trigger if exists on_auth_user_created on auth.users;
drop function if exists public.handle_new_user;

-- Ensure team_members has a uniqueness rule for (user_id, business_id)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'team_members'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_indexes
      WHERE schemaname = 'public'
        AND indexname = 'team_members_user_business_key'
    ) THEN
      EXECUTE 'CREATE UNIQUE INDEX team_members_user_business_key ON public.team_members (user_id, business_id)';
    END IF;
  END IF;
END $$;

create or replace function public.handle_new_user()
returns trigger as $$
declare
  new_business_id text;
  invite_business_id text;
  invite_role text;
begin
  if to_regclass('public.invites') is not null then
    select business_id, role
      into invite_business_id, invite_role
    from public.invites
    where lower(email) = lower(new.email)
      and expires_at > now()
    limit 1;
  end if;

  if invite_business_id is not null then
    new_business_id := invite_business_id;
  else
    new_business_id := 'biz-' || replace(new.id::text, '-', '');
  end if;

  if invite_business_id is null then
    begin
      insert into public.businesses (id, name, owner_id, created_at)
      values (
        new_business_id,
        coalesce(new.raw_user_meta_data->>'businessName', new.raw_user_meta_data->>'name', 'New Business'),
        new.id,
        now()
      )
      on conflict (id) do nothing;
    exception
      when others then
        raise notice 'Business insert failed: %', SQLERRM;
    end;
  end if;

  begin
    insert into public.profiles (id, email, role, business_id, created_at, account_type)
    values (
      new.id,
      new.email,
      coalesce(invite_role, 'admin'),
      new_business_id,
      now(),
      case when invite_business_id is null then 'business_owner' else 'team_member' end
    )
    on conflict (id) do update
      set email = excluded.email,
          role = excluded.role,
          business_id = excluded.business_id,
          account_type = excluded.account_type;
  exception
    when others then
      raise notice 'Profile upsert failed: %', SQLERRM;
  end;

  if to_regclass('public.team_members') is not null then
    begin
      insert into public.team_members (user_id, email, name, role, business_id, created_at, last_login, membership_type)
      values (
        new.id,
        new.email,
        coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
        coalesce(invite_role, 'admin'),
        new_business_id,
        now(),
        now(),
        case when invite_business_id is null then 'owner' else 'team_member' end
      )
      on conflict (user_id, business_id) do nothing;
    exception
      when others then
        raise notice 'Team member insert failed: %', SQLERRM;
    end;
  end if;

  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
