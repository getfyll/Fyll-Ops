-- ==================================================================
-- COLLABORATION PINNED & SAVED MESSAGES
-- ==================================================================
-- Pinned messages are thread-wide (visible to all members).
-- Saved messages are per-user (only visible to the user who saved).
-- Safe to run multiple times.
-- ==================================================================

-- Pinned messages (thread-wide)
create table if not exists public.collaboration_pinned_messages (
  id uuid primary key default gen_random_uuid(),
  business_id text not null,
  thread_id uuid not null,
  comment_id uuid not null,
  pinned_by text not null,
  created_at timestamptz not null default now(),
  unique (thread_id, comment_id),
  constraint collaboration_pinned_thread_fk
    foreign key (thread_id, business_id)
    references public.collaboration_threads(id, business_id)
    on delete cascade,
  constraint collaboration_pinned_comment_fk
    foreign key (comment_id, business_id)
    references public.collaboration_comments(id, business_id)
    on delete cascade
);

-- Saved messages (per-user)
create table if not exists public.collaboration_saved_messages (
  id uuid primary key default gen_random_uuid(),
  business_id text not null,
  thread_id uuid not null,
  comment_id uuid not null,
  user_id text not null,
  created_at timestamptz not null default now(),
  unique (user_id, comment_id),
  constraint collaboration_saved_thread_fk
    foreign key (thread_id, business_id)
    references public.collaboration_threads(id, business_id)
    on delete cascade,
  constraint collaboration_saved_comment_fk
    foreign key (comment_id, business_id)
    references public.collaboration_comments(id, business_id)
    on delete cascade
);

-- Indexes
create index if not exists collaboration_pinned_thread_idx
  on public.collaboration_pinned_messages (thread_id);
create index if not exists collaboration_pinned_business_idx
  on public.collaboration_pinned_messages (business_id);

create index if not exists collaboration_saved_user_idx
  on public.collaboration_saved_messages (user_id, thread_id);
create index if not exists collaboration_saved_business_idx
  on public.collaboration_saved_messages (business_id);

-- RLS
alter table public.collaboration_pinned_messages enable row level security;
alter table public.collaboration_saved_messages enable row level security;

-- Pinned: anyone in the business can see, pin, unpin
drop policy if exists collaboration_pinned_select_v1 on public.collaboration_pinned_messages;
create policy collaboration_pinned_select_v1
  on public.collaboration_pinned_messages for select
  using (business_id = public.get_user_business_id());

drop policy if exists collaboration_pinned_insert_v1 on public.collaboration_pinned_messages;
create policy collaboration_pinned_insert_v1
  on public.collaboration_pinned_messages for insert
  with check (
    business_id = public.get_user_business_id()
    and pinned_by = auth.uid()::text
  );

drop policy if exists collaboration_pinned_delete_v1 on public.collaboration_pinned_messages;
create policy collaboration_pinned_delete_v1
  on public.collaboration_pinned_messages for delete
  using (business_id = public.get_user_business_id());

-- Saved: only the user who saved can see/manage their saves
drop policy if exists collaboration_saved_select_v1 on public.collaboration_saved_messages;
create policy collaboration_saved_select_v1
  on public.collaboration_saved_messages for select
  using (
    business_id = public.get_user_business_id()
    and user_id = auth.uid()::text
  );

drop policy if exists collaboration_saved_insert_v1 on public.collaboration_saved_messages;
create policy collaboration_saved_insert_v1
  on public.collaboration_saved_messages for insert
  with check (
    business_id = public.get_user_business_id()
    and user_id = auth.uid()::text
  );

drop policy if exists collaboration_saved_delete_v1 on public.collaboration_saved_messages;
create policy collaboration_saved_delete_v1
  on public.collaboration_saved_messages for delete
  using (
    business_id = public.get_user_business_id()
    and user_id = auth.uid()::text
  );

-- Realtime
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      alter publication supabase_realtime add table public.collaboration_pinned_messages;
    exception
      when duplicate_object then null;
    end;
    begin
      alter publication supabase_realtime add table public.collaboration_saved_messages;
    exception
      when duplicate_object then null;
    end;
  end if;
end $$;

analyze public.collaboration_pinned_messages;
analyze public.collaboration_saved_messages;
