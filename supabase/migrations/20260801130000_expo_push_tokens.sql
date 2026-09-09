-- ==================================================================
-- EXPO PUSH TOKENS — NATIVE MOBILE PUSH DELIVERY
-- ==================================================================
-- Stores each signed-in user's Expo push token per device so the
-- send-thread-notification Edge Function can deliver push notifications
-- to the native iOS/Android app, not just the web (OneSignal) client.
-- ==================================================================

create table if not exists public.expo_push_tokens (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  expo_push_token text not null,
  platform text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, expo_push_token)
);

create index if not exists expo_push_tokens_user_id_idx on public.expo_push_tokens (user_id);
create index if not exists expo_push_tokens_business_id_idx on public.expo_push_tokens (business_id);

alter table public.expo_push_tokens enable row level security;

drop policy if exists "Users manage their own push tokens" on public.expo_push_tokens;
create policy "Users manage their own push tokens"
  on public.expo_push_tokens
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
