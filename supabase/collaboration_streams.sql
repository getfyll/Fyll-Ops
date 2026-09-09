-- ==================================================================
-- FYLL COLLABORATION STREAMS (ORDER + CASE THREADS)
-- ==================================================================
-- Team-only comments, replies, mentions, and in-app notifications.
-- Run this in Supabase SQL Editor after data_tables.sql + cases_table.sql.
-- Safe to run multiple times.
-- ==================================================================

create extension if not exists pgcrypto;

-- Ensure business helper exists for RLS checks.
create or replace function public.get_user_business_id()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select business_id
  from public.profiles
  where id = auth.uid()
  limit 1;
$$;

-- One stream thread per order or case.
create table if not exists public.collaboration_threads (
  id uuid primary key default gen_random_uuid(),
  business_id text not null,
  entity_type text not null check (entity_type in ('order', 'case')),
  entity_id text not null,
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, business_id),
  unique (business_id, entity_type, entity_id)
);

-- Comments in a thread. Replies are comments with parent_comment_id.
create table if not exists public.collaboration_comments (
  id uuid primary key default gen_random_uuid(),
  business_id text not null,
  thread_id uuid not null,
  parent_comment_id uuid,
  author_user_id text not null,
  body text not null check (char_length(trim(body)) > 0 and char_length(body) <= 4000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  edited_at timestamptz,
  unique (id, business_id),
  constraint collaboration_comments_thread_fk
    foreign key (thread_id, business_id)
    references public.collaboration_threads(id, business_id)
    on delete cascade,
  constraint collaboration_comments_parent_fk
    foreign key (parent_comment_id, business_id)
    references public.collaboration_comments(id, business_id)
    on delete cascade
);

-- File attachments for a comment.
create table if not exists public.collaboration_attachments (
  id uuid primary key default gen_random_uuid(),
  business_id text not null,
  comment_id uuid not null,
  file_name text not null check (char_length(trim(file_name)) > 0 and char_length(file_name) <= 255),
  mime_type text,
  file_size bigint not null check (file_size >= 0 and file_size <= 104857600),
  storage_path text not null check (char_length(trim(storage_path)) > 0),
  created_at timestamptz not null default now(),
  unique (id, business_id),
  constraint collaboration_attachments_comment_fk
    foreign key (comment_id, business_id)
    references public.collaboration_comments(id, business_id)
    on delete cascade
);

-- Mention targets parsed from a comment body.
create table if not exists public.collaboration_mentions (
  id uuid primary key default gen_random_uuid(),
  business_id text not null,
  comment_id uuid not null,
  mentioned_user_id text not null,
  created_at timestamptz not null default now(),
  constraint collaboration_mentions_comment_fk
    foreign key (comment_id, business_id)
    references public.collaboration_comments(id, business_id)
    on delete cascade,
  unique (comment_id, mentioned_user_id)
);

-- In-app notifications created from mentions/replies.
create table if not exists public.collaboration_notifications (
  id uuid primary key default gen_random_uuid(),
  business_id text not null,
  user_id text not null,
  actor_user_id text,
  thread_id uuid,
  comment_id uuid,
  event_type text not null check (event_type in ('mention', 'reply')),
  payload jsonb not null default '{}'::jsonb,
  is_read boolean not null default false,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  constraint collaboration_notifications_thread_fk
    foreign key (thread_id, business_id)
    references public.collaboration_threads(id, business_id)
    on delete cascade,
  constraint collaboration_notifications_comment_fk
    foreign key (comment_id, business_id)
    references public.collaboration_comments(id, business_id)
    on delete cascade
);

create index if not exists collaboration_threads_business_id_idx
  on public.collaboration_threads (business_id);
create index if not exists collaboration_threads_entity_lookup_idx
  on public.collaboration_threads (business_id, entity_type, entity_id);

create index if not exists collaboration_comments_business_id_idx
  on public.collaboration_comments (business_id);
create index if not exists collaboration_comments_thread_created_idx
  on public.collaboration_comments (thread_id, created_at desc);
create index if not exists collaboration_comments_parent_idx
  on public.collaboration_comments (parent_comment_id);

create index if not exists collaboration_attachments_business_id_idx
  on public.collaboration_attachments (business_id);
create index if not exists collaboration_attachments_comment_idx
  on public.collaboration_attachments (comment_id, created_at asc);

create index if not exists collaboration_mentions_business_id_idx
  on public.collaboration_mentions (business_id);
create index if not exists collaboration_mentions_user_idx
  on public.collaboration_mentions (mentioned_user_id, created_at desc);

create index if not exists collaboration_notifications_business_id_idx
  on public.collaboration_notifications (business_id);
create index if not exists collaboration_notifications_user_unread_idx
  on public.collaboration_notifications (user_id, is_read, created_at desc);

-- Cleanup historical duplicate notifications (safe to rerun).
-- 1) If a user has both reply + mention for the same comment, keep mention and drop reply.
delete from public.collaboration_notifications reply
using public.collaboration_notifications mention
where reply.business_id = mention.business_id
  and reply.user_id = mention.user_id
  and reply.comment_id = mention.comment_id
  and reply.event_type = 'reply'
  and mention.event_type = 'mention';

-- 2) Collapse exact duplicates (same comment/user/event_type), keeping the oldest row.
with ranked_collaboration_notifications as (
  select
    id,
    row_number() over (
      partition by business_id, user_id, comment_id, event_type
      order by created_at asc, id asc
    ) as row_num
  from public.collaboration_notifications
  where comment_id is not null
)
delete from public.collaboration_notifications n
using ranked_collaboration_notifications ranked
where n.id = ranked.id
  and ranked.row_num > 1;

-- DB-level dedupe guard for retries / duplicate trigger execution.
create unique index if not exists collaboration_notifications_comment_user_event_uniq_idx
  on public.collaboration_notifications (business_id, user_id, comment_id, event_type)
  where comment_id is not null;

alter table public.collaboration_threads enable row level security;
alter table public.collaboration_comments enable row level security;
alter table public.collaboration_attachments enable row level security;
alter table public.collaboration_mentions enable row level security;
alter table public.collaboration_notifications enable row level security;

drop policy if exists collaboration_threads_select_v1 on public.collaboration_threads;
drop policy if exists collaboration_threads_insert_v1 on public.collaboration_threads;
drop policy if exists collaboration_threads_update_v1 on public.collaboration_threads;
drop policy if exists collaboration_threads_delete_v1 on public.collaboration_threads;

create policy collaboration_threads_select_v1
  on public.collaboration_threads for select
  using (business_id = public.get_user_business_id());

create policy collaboration_threads_insert_v1
  on public.collaboration_threads for insert
  with check (
    business_id = public.get_user_business_id()
    and created_by = auth.uid()::text
  );

create policy collaboration_threads_update_v1
  on public.collaboration_threads for update
  using (business_id = public.get_user_business_id());

create policy collaboration_threads_delete_v1
  on public.collaboration_threads for delete
  using (business_id = public.get_user_business_id());

drop policy if exists collaboration_comments_select_v1 on public.collaboration_comments;
drop policy if exists collaboration_comments_insert_v1 on public.collaboration_comments;
drop policy if exists collaboration_comments_update_v1 on public.collaboration_comments;
drop policy if exists collaboration_comments_delete_v1 on public.collaboration_comments;

create policy collaboration_comments_select_v1
  on public.collaboration_comments for select
  using (business_id = public.get_user_business_id());

create policy collaboration_comments_insert_v1
  on public.collaboration_comments for insert
  with check (
    business_id = public.get_user_business_id()
    and author_user_id = auth.uid()::text
  );

create policy collaboration_comments_update_v1
  on public.collaboration_comments for update
  using (
    business_id = public.get_user_business_id()
    and author_user_id = auth.uid()::text
  );

create policy collaboration_comments_delete_v1
  on public.collaboration_comments for delete
  using (
    business_id = public.get_user_business_id()
    and author_user_id = auth.uid()::text
  );

drop policy if exists collaboration_attachments_select_v1 on public.collaboration_attachments;
drop policy if exists collaboration_attachments_insert_v1 on public.collaboration_attachments;
drop policy if exists collaboration_attachments_delete_v1 on public.collaboration_attachments;

create policy collaboration_attachments_select_v1
  on public.collaboration_attachments for select
  using (business_id = public.get_user_business_id());

create policy collaboration_attachments_insert_v1
  on public.collaboration_attachments for insert
  with check (
    business_id = public.get_user_business_id()
    and exists (
      select 1
      from public.collaboration_comments c
      where c.id = comment_id
        and c.business_id = public.get_user_business_id()
        and c.author_user_id = auth.uid()::text
    )
  );

create policy collaboration_attachments_delete_v1
  on public.collaboration_attachments for delete
  using (
    business_id = public.get_user_business_id()
    and exists (
      select 1
      from public.collaboration_comments c
      where c.id = comment_id
        and c.business_id = public.get_user_business_id()
        and c.author_user_id = auth.uid()::text
    )
  );

drop policy if exists collaboration_mentions_select_v1 on public.collaboration_mentions;
drop policy if exists collaboration_mentions_insert_v1 on public.collaboration_mentions;
drop policy if exists collaboration_mentions_delete_v1 on public.collaboration_mentions;

create policy collaboration_mentions_select_v1
  on public.collaboration_mentions for select
  using (business_id = public.get_user_business_id());

create policy collaboration_mentions_insert_v1
  on public.collaboration_mentions for insert
  with check (
    business_id = public.get_user_business_id()
    and exists (
      select 1
      from public.collaboration_comments c
      where c.id = comment_id
        and c.business_id = public.get_user_business_id()
        and c.author_user_id = auth.uid()::text
    )
  );

create policy collaboration_mentions_delete_v1
  on public.collaboration_mentions for delete
  using (business_id = public.get_user_business_id());

drop policy if exists collaboration_notifications_select_v1 on public.collaboration_notifications;
drop policy if exists collaboration_notifications_insert_v1 on public.collaboration_notifications;
drop policy if exists collaboration_notifications_update_v1 on public.collaboration_notifications;
drop policy if exists collaboration_notifications_delete_v1 on public.collaboration_notifications;

create policy collaboration_notifications_select_v1
  on public.collaboration_notifications for select
  using (
    business_id = public.get_user_business_id()
    and user_id = auth.uid()::text
  );

create policy collaboration_notifications_insert_v1
  on public.collaboration_notifications for insert
  with check (
    business_id = public.get_user_business_id()
    and actor_user_id = auth.uid()::text
  );

create policy collaboration_notifications_update_v1
  on public.collaboration_notifications for update
  using (
    business_id = public.get_user_business_id()
    and user_id = auth.uid()::text
  );

create policy collaboration_notifications_delete_v1
  on public.collaboration_notifications for delete
  using (
    business_id = public.get_user_business_id()
    and user_id = auth.uid()::text
  );

-- Storage bucket for collaboration file attachments.
insert into storage.buckets (id, name, public, file_size_limit)
values ('collaboration-attachments', 'collaboration-attachments', false, 15728640)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit;

drop policy if exists storage_collaboration_attachments_select_v1 on storage.objects;
drop policy if exists storage_collaboration_attachments_insert_v1 on storage.objects;
drop policy if exists storage_collaboration_attachments_update_v1 on storage.objects;
drop policy if exists storage_collaboration_attachments_delete_v1 on storage.objects;

create policy storage_collaboration_attachments_select_v1
  on storage.objects for select
  using (
    bucket_id = 'collaboration-attachments'
    and (storage.foldername(name))[1] = public.get_user_business_id()
  );

create policy storage_collaboration_attachments_insert_v1
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'collaboration-attachments'
    and (storage.foldername(name))[1] = public.get_user_business_id()
  );

create policy storage_collaboration_attachments_update_v1
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'collaboration-attachments'
    and (storage.foldername(name))[1] = public.get_user_business_id()
  )
  with check (
    bucket_id = 'collaboration-attachments'
    and (storage.foldername(name))[1] = public.get_user_business_id()
  );

create policy storage_collaboration_attachments_delete_v1
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'collaboration-attachments'
    and (storage.foldername(name))[1] = public.get_user_business_id()
  );

-- Keep updated_at fresh on edits.
create or replace function public.set_collaboration_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists collaboration_threads_set_updated_at on public.collaboration_threads;
create trigger collaboration_threads_set_updated_at
before update on public.collaboration_threads
for each row execute function public.set_collaboration_updated_at();

drop trigger if exists collaboration_comments_set_updated_at on public.collaboration_comments;
create trigger collaboration_comments_set_updated_at
before update on public.collaboration_comments
for each row execute function public.set_collaboration_updated_at();

-- RPC helper for creating comments from clients.
drop function if exists public.create_collaboration_comment(text, uuid, uuid, text, text);
create or replace function public.create_collaboration_comment(
  p_business_id text,
  p_thread_id uuid,
  p_parent_comment_id uuid,
  p_author_user_id text,
  p_body text
)
returns public.collaboration_comments
language plpgsql
security invoker
set search_path = public
as $$
declare
  inserted_comment public.collaboration_comments;
begin
  if auth.uid() is null then
    raise exception 'No authenticated user.';
  end if;

  if p_author_user_id is distinct from auth.uid()::text then
    raise exception 'Author user mismatch.';
  end if;

  if p_body is null or char_length(trim(p_body)) = 0 then
    raise exception 'Comment cannot be empty.';
  end if;

  if p_parent_comment_id is not null then
    perform 1
    from public.collaboration_comments parent_comment
    where parent_comment.id = p_parent_comment_id
      and parent_comment.thread_id = p_thread_id
      and parent_comment.business_id = p_business_id;

    if not found then
      raise exception 'Parent comment not found in thread.';
    end if;
  end if;

  insert into public.collaboration_comments (
    business_id,
    thread_id,
    parent_comment_id,
    author_user_id,
    body
  )
  values (
    p_business_id,
    p_thread_id,
    p_parent_comment_id,
    auth.uid()::text,
    trim(p_body)
  )
  returning * into inserted_comment;

  return inserted_comment;
end;
$$;

-- Create reply notifications when someone replies to another person.
create or replace function public.notify_collaboration_reply()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  parent_author_user_id text;
begin
  if new.parent_comment_id is null then
    return new;
  end if;

  select c.author_user_id
    into parent_author_user_id
  from public.collaboration_comments c
  where c.id = new.parent_comment_id
  limit 1;

  if parent_author_user_id is null or parent_author_user_id = new.author_user_id then
    return new;
  end if;

  if not exists (
    select 1
    from public.profiles p
    where p.id::text = parent_author_user_id
      and p.business_id = new.business_id
  ) then
    return new;
  end if;

  -- If the parent author is explicitly mentioned in the same comment, prefer the
  -- mention notification and skip the generic reply notification.
  if exists (
    select 1
    from public.collaboration_mentions m
    where m.business_id = new.business_id
      and m.comment_id = new.id
      and m.mentioned_user_id = parent_author_user_id
  ) then
    return new;
  end if;

  insert into public.collaboration_notifications (
    business_id,
    user_id,
    actor_user_id,
    thread_id,
    comment_id,
    event_type,
    payload
  )
  values (
    new.business_id,
    parent_author_user_id,
    new.author_user_id,
    new.thread_id,
    new.id,
    'reply',
    jsonb_build_object('parent_comment_id', new.parent_comment_id)
  )
  on conflict do nothing;

  return new;
end;
$$;

drop trigger if exists collaboration_reply_notification_trigger on public.collaboration_comments;
create trigger collaboration_reply_notification_trigger
after insert on public.collaboration_comments
for each row execute function public.notify_collaboration_reply();

-- Create mention notifications when a comment mentions team members.
create or replace function public.notify_collaboration_mention()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  comment_author_user_id text;
  comment_thread_id uuid;
begin
  select c.author_user_id, c.thread_id
    into comment_author_user_id, comment_thread_id
  from public.collaboration_comments c
  where c.id = new.comment_id
  limit 1;

  if comment_author_user_id is null then
    return new;
  end if;

  if new.mentioned_user_id = comment_author_user_id then
    return new;
  end if;

  if not exists (
    select 1
    from public.profiles p
    where p.id::text = new.mentioned_user_id
      and p.business_id = new.business_id
  ) then
    return new;
  end if;

  -- Prefer mention over reply when both target the same recipient for the same comment.
  delete from public.collaboration_notifications
  where business_id = new.business_id
    and user_id = new.mentioned_user_id
    and comment_id = new.comment_id
    and event_type = 'reply';

  insert into public.collaboration_notifications (
    business_id,
    user_id,
    actor_user_id,
    thread_id,
    comment_id,
    event_type,
    payload
  )
  values (
    new.business_id,
    new.mentioned_user_id,
    comment_author_user_id,
    comment_thread_id,
    new.comment_id,
    'mention',
    '{}'::jsonb
  )
  on conflict do nothing;

  return new;
end;
$$;

drop trigger if exists collaboration_mention_notification_trigger on public.collaboration_mentions;
create trigger collaboration_mention_notification_trigger
after insert on public.collaboration_mentions
for each row execute function public.notify_collaboration_mention();

-- Parse @mentions in comment bodies and insert into collaboration_mentions.
-- This allows clients to only insert a comment; the DB will create mention rows
-- (idempotent and safe: uses ON CONFLICT DO NOTHING and swallows unexpected errors).
create or replace function public.insert_collaboration_mentions_from_comment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  tokens text[];
  token text;
  profile_id text;
begin
  select array_agg(distinct regexp_replace(match, '^@', ''))
    into tokens
  from (
    select unnest(regexp_matches(new.body, '@[A-Za-z0-9_.-]+', 'g')) as match
  ) sub;

  if tokens is null then
    return new;
  end if;

  foreach token in array tokens loop
    select p.id into profile_id
    from public.profiles p
    where p.business_id = new.business_id
      and (
        p.id::text = token
        or lower(p.name) = lower(token)
      )
    limit 1;

    if profile_id is not null and profile_id <> new.author_user_id then
      begin
        insert into public.collaboration_mentions (business_id, comment_id, mentioned_user_id)
        values (new.business_id, new.id, profile_id)
        on conflict do nothing;
      exception when others then
        -- Swallow errors to avoid failing the comment insert flow.
        null;
      end;
    end if;
  end loop;

  return new;
end;
$$;

drop trigger if exists collaboration_comments_mention_parser_trigger on public.collaboration_comments;
create trigger collaboration_comments_mention_parser_trigger
after insert on public.collaboration_comments
for each row execute function public.insert_collaboration_mentions_from_comment();

-- Realtime subscriptions support (safe if already added).
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      alter publication supabase_realtime add table public.collaboration_threads;
    exception
      when duplicate_object then null;
    end;
    begin
      alter publication supabase_realtime add table public.collaboration_comments;
    exception
      when duplicate_object then null;
    end;
    begin
      alter publication supabase_realtime add table public.collaboration_attachments;
    exception
      when duplicate_object then null;
    end;
    begin
      alter publication supabase_realtime add table public.collaboration_mentions;
    exception
      when duplicate_object then null;
    end;
    begin
      alter publication supabase_realtime add table public.collaboration_notifications;
    exception
      when duplicate_object then null;
    end;
  end if;
end $$;

analyze public.collaboration_threads;
analyze public.collaboration_comments;
analyze public.collaboration_attachments;
analyze public.collaboration_mentions;
analyze public.collaboration_notifications;

-- Smoke test: verify the comment RPC signature and return type.
do $$
declare
  function_oid oid;
  function_result text;
begin
  select p.oid, pg_get_function_result(p.oid)
    into function_oid, function_result
  from pg_proc p
  join pg_namespace n
    on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'create_collaboration_comment'
    and pg_get_function_identity_arguments(p.oid) =
      'p_business_id text, p_thread_id uuid, p_parent_comment_id uuid, p_author_user_id text, p_body text'
  limit 1;

  if function_oid is null then
    raise exception
      'Smoke test failed: public.create_collaboration_comment(p_business_id text, p_thread_id uuid, p_parent_comment_id uuid, p_author_user_id text, p_body text) was not found.';
  end if;

  if function_result not in ('collaboration_comments', 'public.collaboration_comments') then
    raise exception
      'Smoke test failed: create_collaboration_comment must return public.collaboration_comments, got %.',
      function_result;
  end if;
end $$;

-- ==================================================================
-- DONE! Collaboration streams foundation is ready.
-- ==================================================================
