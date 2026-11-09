-- Additive prospect follow-up columns, declined status, and the inbound inbox.
-- Apply this before 20261109120100_activity_catalog.sql.
-- New enum values cannot be used in the same transaction, so this file only adds 'declined'.

alter type public.organizer_status add value if not exists 'declined';

alter table public.organizers
  add column if not exists started_at timestamptz,
  add column if not exists replied_at timestamptz,
  add column if not exists unsubscribed_at timestamptz,
  add column if not exists declined_at timestamptz;

create table if not exists public.inbound_messages (
  id uuid primary key default gen_random_uuid(),
  organizer_id uuid references public.organizers (organizer_id),
  from_email text not null,
  to_email text not null,
  subject text,
  body_text text,
  body_html text,
  received_at timestamptz not null default now(),
  resend_id text unique,
  handled_at timestamptz
);

alter table public.inbound_messages enable row level security;

drop policy if exists "admin all access" on public.inbound_messages;
create policy "admin all access" on public.inbound_messages
  for all
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

revoke all on public.inbound_messages from anon, authenticated;
grant select, insert, update, delete on public.inbound_messages to service_role;
