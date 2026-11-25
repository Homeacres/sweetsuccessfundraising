-- area_waitlist: consented email interest only.
-- No name, no full postal code, no notes, no IP.

create table public.area_waitlist (
  id              uuid primary key default gen_random_uuid(),
  email           text not null
                  check (
                    email = lower(email)
                    and char_length(email) <= 254
                    and email ~ '^[^@]+@[^@]+[.][^@]+$'
                  ),
  country         text not null check (country in ('CA', 'US')),
  postal_prefix   text not null,
  consent_text    text not null,
  consented_at    timestamptz not null default now(),
  unsub_token     text not null unique
                  default encode(extensions.gen_random_bytes(32), 'hex')
                  check (
                    char_length(unsub_token) >= 32
                    and unsub_token ~ '^[A-Za-z0-9]+$'
                  ),
  unsubscribed_at timestamptz,
  notified_at     timestamptz,
  check (
    postal_prefix = upper(replace(postal_prefix, ' ', ''))
    and (
      (country = 'CA' and postal_prefix ~ '^[A-Z][0-9][A-Z]$')
      or
      (country = 'US' and postal_prefix ~ '^[0-9]{3}$')
    )
  )
);

comment on table public.area_waitlist is
  'Optional out-of-area email waitlist. One consented email plus FSA or 3-digit ZIP. No name, no full postal code, no notes.';

comment on column public.area_waitlist.postal_prefix is
  'Canadian FSA (for example S7K) or the first three digits of a US ZIP. Never a full postal code.';

comment on column public.area_waitlist.consent_text is
  'Exact consent wording shown when the person ticked the box. The app must store the wording that was shown.';

comment on column public.area_waitlist.unsub_token is
  'Random unique token for the unsubscribe link on any later approved email.';

comment on column public.area_waitlist.notified_at is
  'Set only when a later, Chris-approved we-are-in-your-area email is actually sent. This migration sends no mail.';

alter table public.area_waitlist enable row level security;
-- No policies for the anon or authenticated roles.
-- Reads and writes go only through the server, using the service-role key.

revoke all on table public.area_waitlist from anon, authenticated, public;
grant select, insert, update, delete on table public.area_waitlist to service_role;

create index area_waitlist_prefix_idx
  on public.area_waitlist (country, postal_prefix);

create unique index area_waitlist_email_country_prefix
  on public.area_waitlist (lower(email), country, postal_prefix);

-- rejected_area_tallies: one count per country, prefix, and day.
-- Same FSA or 3-digit ZIP grain. Date is America/Edmonton.
-- No email, name, IP, or full postal code.

create table public.rejected_area_tallies (
  tally_id         uuid primary key default gen_random_uuid(),
  country          text not null check (country in ('CA', 'US')),
  prefix           text not null,
  attempted_on     date not null default (timezone('America/Edmonton', now()))::date,
  rejection_count  integer not null default 1 check (rejection_count > 0),
  unique (country, prefix, attempted_on),
  check (
    prefix = upper(replace(prefix, ' ', ''))
    and (
      (country = 'CA' and prefix ~ '^[A-Z][0-9][A-Z]$')
      or
      (country = 'US' and prefix ~ '^[0-9]{3}$')
    )
  )
);

comment on table public.rejected_area_tallies is
  'Count of out-of-area intake rejections per country, FSA or 3-digit ZIP, and America/Edmonton date. No personal data.';

alter table public.rejected_area_tallies enable row level security;
-- No policies for the anon or authenticated roles.
-- Same as area_waitlist: server / service-role key only.

revoke all on table public.rejected_area_tallies from anon, authenticated, public;
grant select, insert, update, delete on table public.rejected_area_tallies to service_role;

create function public.increment_rejected_area_tally(
  p_country text,
  p_prefix  text
) returns integer
language plpgsql
set search_path = public
as $$
declare
  v_prefix text;
  v_count  integer;
begin
  v_prefix := upper(replace(p_prefix, ' ', ''));
  if p_country not in ('CA', 'US') then
    raise exception 'invalid country';
  end if;
  if not (
    (p_country = 'CA' and v_prefix ~ '^[A-Z][0-9][A-Z]$')
    or
    (p_country = 'US' and v_prefix ~ '^[0-9]{3}$')
  ) then
    raise exception 'invalid prefix';
  end if;

  insert into public.rejected_area_tallies as t
    (country, prefix, attempted_on, rejection_count)
  values (
    p_country,
    v_prefix,
    (timezone('America/Edmonton', now()))::date,
    1
  )
  on conflict (country, prefix, attempted_on)
  do update set rejection_count = t.rejection_count + 1
  returning t.rejection_count into v_count;

  return v_count;
end;
$$;

revoke all on function public.increment_rejected_area_tally(text, text)
  from public, anon, authenticated;
grant execute on function public.increment_rejected_area_tally(text, text)
  to service_role;
