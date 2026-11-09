-- Leaderboard is opt-in. Unticked means the participant is left out of every public list.
-- Apply after 20261109130000_launch_windows.sql. Not applied yet.

alter table public.campaign_participants
  add column if not exists leaderboard_opt_in boolean not null default false;
