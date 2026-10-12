-- The invitation-request emails are only sent for a request that was really just saved, and only once.
-- This column records when they went out, so the Edge Function cannot be used to email arbitrary
-- addresses or to send the same confirmation twice.
alter table public.invitation_requests
  add column if not exists confirmation_sent_at timestamptz;
