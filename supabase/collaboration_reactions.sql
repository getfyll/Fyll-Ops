-- ==================================================================
-- COLLABORATION COMMENT REACTIONS (thumbs-up / like)
-- ==================================================================
-- Persists message reactions across app restarts and across team members.
-- Run after `collaboration_streams.sql`. Safe to run multiple times.
-- ==================================================================

create table if not exists public.collaboration_comment_reactions (
  id uuid primary key default gen_random_uuid(),
  business_id text not null,
  comment_id uuid not null,
  user_id text not null,
  reaction text not null default 'thumbs_up' check (reaction in ('thumbs_up')),
  created_at timestamptz not null default now(),
  unique (comment_id, user_id, reaction),
  constraint collaboration_comment_reactions_comment_fk
    foreign key (comment_id, business_id)
    references public.collaboration_comments(id, business_id)
    on delete cascade
);

create index if not exists collaboration_comment_reactions_business_idx
  on public.collaboration_comment_reactions (business_id);

create index if not exists collaboration_comment_reactions_comment_idx
  on public.collaboration_comment_reactions (comment_id, created_at asc);

create index if not exists collaboration_comment_reactions_user_idx
  on public.collaboration_comment_reactions (user_id, created_at desc);

alter table public.collaboration_comment_reactions enable row level security;

drop policy if exists collaboration_comment_reactions_select_v1 on public.collaboration_comment_reactions;
create policy collaboration_comment_reactions_select_v1
  on public.collaboration_comment_reactions for select
  using (business_id = public.get_user_business_id());

drop policy if exists collaboration_comment_reactions_insert_v1 on public.collaboration_comment_reactions;
create policy collaboration_comment_reactions_insert_v1
  on public.collaboration_comment_reactions for insert
  with check (
    business_id = public.get_user_business_id()
    and user_id = auth.uid()::text
  );

drop policy if exists collaboration_comment_reactions_delete_v1 on public.collaboration_comment_reactions;
create policy collaboration_comment_reactions_delete_v1
  on public.collaboration_comment_reactions for delete
  using (
    business_id = public.get_user_business_id()
    and user_id = auth.uid()::text
  );

-- Realtime support (safe if already added)
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      alter publication supabase_realtime add table public.collaboration_comment_reactions;
    exception
      when duplicate_object then null;
    end;
  end if;
end $$;

analyze public.collaboration_comment_reactions;
