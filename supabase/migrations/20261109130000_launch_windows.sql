-- Open start windows and the organizer's window request. Not applied yet.

create table if not exists public.launch_windows (
  window_id uuid primary key default gen_random_uuid(),
  label text not null,
  start_date date not null,
  end_date date not null,
  is_open boolean not null default true,
  created_at timestamptz not null default now(),
  constraint launch_windows_dates check (end_date >= start_date)
);

alter table public.launch_windows enable row level security;

drop policy if exists "admin all access" on public.launch_windows;
create policy "admin all access" on public.launch_windows
  for all
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

revoke all on public.launch_windows from anon, authenticated;
grant select, insert, update, delete on public.launch_windows to service_role;

alter table public.organizers
  add column if not exists request_submitted_at timestamptz,
  add column if not exists requested_window_id uuid references public.launch_windows (window_id),
  add column if not exists offered_window_id uuid references public.launch_windows (window_id),
  add column if not exists agreed_window_id uuid references public.launch_windows (window_id),
  add column if not exists confirmed_participant_count integer,
  add column if not exists confirmed_goal_cents integer,
  add column if not exists review_status text,
  add column if not exists parked_at timestamptz;

alter table public.organizers drop constraint if exists organizers_review_status_check;
alter table public.organizers add constraint organizers_review_status_check
  check (review_status is null or review_status in ('pending', 'alternate', 'approved', 'waitlist', 'not_this_season'));
