-- Applied on Preview only, 23 November 2026.
-- Chris OK, in his own words, relayed via Gus and SSF CEO at 1:11 PM America/Edmonton:
-- "Yes, I OK Bob's partners and postal-area change on Preview only".
-- SSF CEO approved with changes earlier the same day.
-- Optional rejected_area_tallies table is left out; it is a separate waitlist draft.
-- Fixed id for SSF Sundre. All seeds and backfills use this uuid, not a name lookup.
-- 760bd794-b599-4a73-a1d5-1ce2af7414e2

create table public.partners (
  partner_id   uuid primary key,
  name         text not null,
  kind         text not null default 'fulfillment'
               check (kind in ('fulfillment', 'maker', 'both')),
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  unique (name)
);

alter table public.partners enable row level security;
-- No policies for the anon or authenticated roles.
-- Reads and writes go only through the server, using the service-role key.

insert into public.partners (partner_id, name, kind)
values ('760bd794-b599-4a73-a1d5-1ce2af7414e2', 'SSF Sundre', 'both');

create table public.postal_areas (
  area_id     uuid primary key default gen_random_uuid(),
  prefix      text not null,
  country     text not null check (country in ('CA', 'US')),
  is_active   boolean not null default true,
  partner_id  uuid not null references public.partners (partner_id),
  created_at  timestamptz not null default now(),
  unique (country, prefix),
  check (
    prefix = upper(replace(prefix, ' ', ''))
    and (
      (country = 'CA' and prefix ~ '^[A-Z][A-Z0-9]{0,2}$')
      or
      (country = 'US' and prefix ~ '^[0-9]{1,5}$')
    )
  )
);

alter table public.postal_areas enable row level security;
-- No policies for the anon or authenticated roles.
-- Same as partners: server / service-role key only.

insert into public.postal_areas (prefix, country, is_active, partner_id)
values ('T', 'CA', true, '760bd794-b599-4a73-a1d5-1ce2af7414e2');

alter table public.campaigns add column partner_id uuid references public.partners (partner_id);
alter table public.products  add column partner_id uuid references public.partners (partner_id);
-- Do not add products.team_share_cents.
-- Team share stays on bag_types.team_share_cents.

alter table public.organizers add column postal_code text;
-- out_of_area_log is not changed. Existing rows stay untouched.

update public.campaigns
set partner_id = '760bd794-b599-4a73-a1d5-1ce2af7414e2'
where partner_id is null;

update public.products
set partner_id = '760bd794-b599-4a73-a1d5-1ce2af7414e2'
where partner_id is null;

create index on public.campaigns (partner_id);
create index on public.products (partner_id);
create index on public.postal_areas (country, is_active, prefix);

-- After Bob's code sets the partner on new rows:
-- alter table public.campaigns alter column partner_id set not null;
-- alter table public.products  alter column partner_id set not null;
