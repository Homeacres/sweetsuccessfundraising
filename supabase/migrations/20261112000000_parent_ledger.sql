-- 20261112000000_parent_ledger.sql
-- Additive only. Preview / test. Do not apply until reviewed.
-- Cash remitted after platform_config.remittance_deadline is left out of
-- production and the pick list. The default is each campaign's order cut-off.

-- ---------------------------------------------------------------------------
-- Config
-- ---------------------------------------------------------------------------
insert into public.platform_config (key, value, description)
values (
  'leaderboard_cash_counting',
  '"when_remitted"'::jsonb,
  'How cash sales count on the leaderboard. when_remitted = only after the parent pays Sweet Success (Chris-confirmed, option B). when_received = once the parent marks cash received (option A). Campaign money totals and the pick list always wait for remittance.'
)
on conflict (key) do nothing;

insert into public.platform_config (key, value, description)
values (
  'cash_receipt_emails_enabled',
  'false'::jsonb,
  'When false, marking cash received still creates the receipt page token but does not send email. Turn on only after Chris signs off. Preview and test mail go only to EMAIL_TEST_RECIPIENT (delivered@resend.dev).'
)
on conflict (key) do nothing;

insert into public.platform_config (key, value, description)
values (
  'remittance_deadline',
  '{"mode":"campaign_cutoff"}'::jsonb,
  'When collected cash must reach Sweet Success to be packed. Default mode campaign_cutoff uses that campaign''s order cut-off (campaigns.end_date). days_after_cutoff adds value.days to the cut-off. fixed_date uses value.date (YYYY-MM-DD) for every campaign. Cash remitted after this date stays off the pick list and production totals. Change this row; the date is not hard-coded in the app.'
)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- share_token: supporter shop only. Must never equal parent_token.
-- ---------------------------------------------------------------------------
alter table public.campaign_participants
  add column if not exists share_token text;

update public.campaign_participants
   set share_token = replace(gen_random_uuid()::text, '-'::text, ''::text)
 where share_token is null
    or length(share_token) < 32
    or share_token = parent_token;

-- Repeat once if a generated value somehow matched parent_token (vanishingly rare).
update public.campaign_participants
   set share_token = replace(gen_random_uuid()::text, '-'::text, ''::text)
 where share_token = parent_token
    or length(share_token) < 32;

alter table public.campaign_participants
  alter column share_token set default replace(gen_random_uuid()::text, '-'::text, ''::text),
  alter column share_token set not null;

alter table public.campaign_participants
  drop constraint if exists campaign_participants_share_token_len,
  drop constraint if exists campaign_participants_share_ne_parent;

alter table public.campaign_participants
  add constraint campaign_participants_share_token_len
    check (length(share_token) >= 32),
  add constraint campaign_participants_share_ne_parent
    check (share_token is distinct from parent_token);

create unique index if not exists campaign_participants_share_token_key
  on public.campaign_participants (share_token);

create or replace function public.fn_assign_share_token()
returns trigger
language plpgsql
set search_path to ''
as $function$
begin
  if new.parent_token is null or length(new.parent_token) < 32 then
    new.parent_token := replace(gen_random_uuid()::text, '-'::text, ''::text);
  end if;
  if new.share_token is null
     or length(new.share_token) < 32
     or new.share_token = new.parent_token then
    loop
      new.share_token := replace(gen_random_uuid()::text, '-'::text, ''::text);
      exit when new.share_token is distinct from new.parent_token
            and length(new.share_token) >= 32;
    end loop;
  end if;
  return new;
end
$function$;

drop trigger if exists trg_assign_share_token on public.campaign_participants;
create trigger trg_assign_share_token
  before insert or update of parent_token, share_token
  on public.campaign_participants
  for each row
  execute function public.fn_assign_share_token();

comment on column public.campaign_participants.share_token is
  'Unguessable shop link only (/s/{share_token}). Never the ledger key. Must differ from parent_token. Rotate with private.fn_admin_rotate_share_token.';
comment on column public.campaign_participants.parent_token is
  'Unguessable ledger, remittance and private-leaderboard key only. Never used on /s/ or any supporter-visible page, email, receipt or URL.';

-- CASL unsubscribe token so shareable emails need not carry parent_token.
alter table public.families
  add column if not exists email_unsub_token text;

update public.families
   set email_unsub_token = replace(gen_random_uuid()::text, '-'::text, ''::text)
 where email_unsub_token is null
    or length(email_unsub_token) < 32;

alter table public.families
  alter column email_unsub_token set default replace(gen_random_uuid()::text, '-'::text, ''::text),
  alter column email_unsub_token set not null;

alter table public.families
  drop constraint if exists families_email_unsub_token_len;
alter table public.families
  add constraint families_email_unsub_token_len
    check (length(email_unsub_token) >= 32);

create unique index if not exists families_email_unsub_token_key
  on public.families (email_unsub_token);

comment on column public.families.email_unsub_token is
  'CASL unsubscribe token for emails that may be forwarded or that include a shop link. Do not put parent_token in those emails.';

-- ---------------------------------------------------------------------------
-- Remittance table (one parent payout covering many cash-received orders)
-- ---------------------------------------------------------------------------
create table if not exists public.parent_remittances (
  remittance_id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns (campaign_id),
  cp_id uuid not null references public.campaign_participants (cp_id),
  family_id uuid not null references public.families (family_id),
  amount_cents integer not null,
  method text not null default 'card',
  status text not null default 'pending',
  stripe_checkout_session_id text,
  stripe_payment_id text,
  paid_at timestamptz,
  is_test boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint parent_remittances_amount_check check (amount_cents > 0),
  constraint parent_remittances_method_check check (method in ('card', 'etransfer')),
  constraint parent_remittances_status_check check (status in ('pending', 'paid', 'failed')),
  constraint parent_remittances_paid_consistent check (
    (status = 'paid' and paid_at is not null)
    or (status <> 'paid' and paid_at is null)
  ),
  constraint parent_remittances_stripe_session_key unique (stripe_checkout_session_id)
);

create index if not exists parent_remittances_cp_idx
  on public.parent_remittances (cp_id, status);
create index if not exists parent_remittances_campaign_idx
  on public.parent_remittances (campaign_id);

-- Enforces reuse: a participant may have only one open remittance at a time.
create unique index if not exists parent_remittances_one_pending_per_cp
  on public.parent_remittances (cp_id)
  where status = 'pending';

comment on table public.parent_remittances is
  'One payment from a parent to SSF for cash they have collected. Pilot method is card (Stripe test). method may be etransfer later. is_test defaults true; the Production app must set is_test=false at insert time before any live use.';
comment on column public.parent_remittances.is_test is
  'Default true. Set false only by the app at insert time in approved Production, never by this migration.';

-- ---------------------------------------------------------------------------
-- Orders: ledger credit, entry source, cash tracking, remittance link
-- ---------------------------------------------------------------------------
alter table public.orders
  add column if not exists cp_id uuid references public.campaign_participants (cp_id),
  add column if not exists entered_by text,
  add column if not exists payment_method text,
  add column if not exists cash_received_at timestamptz,
  add column if not exists cash_received_cents integer,
  add column if not exists cash_received_by text,
  add column if not exists cash_receipt_token text,
  add column if not exists cash_receipt_sent_at timestamptz,
  add column if not exists remittance_id uuid references public.parent_remittances (remittance_id),
  add column if not exists is_test boolean not null default true;

-- Backfill the single existing paid order (and any future pre-migration rows).
update public.orders o
   set cp_id = only_cp.cp_id,
       entered_by = coalesce(o.entered_by, 'supporter'),
       payment_method = coalesce(o.payment_method, 'card')
  from (
    select ol.order_id, (min(ol.cp_id::text))::uuid as cp_id
      from public.order_lines ol
     group by ol.order_id
    having count(distinct ol.cp_id) = 1
  ) only_cp
 where only_cp.order_id = o.order_id
   and o.cp_id is null;

alter table public.orders
  alter column entered_by set default 'supporter',
  alter column payment_method set default 'card';

-- After backfill, require a participant on every order.
alter table public.orders
  alter column cp_id set not null,
  alter column entered_by set not null,
  alter column payment_method set not null;

-- Cash supporters (and parent-entered orders) may have a phone instead of an email.
-- Card orders still need an email for Stripe.
alter table public.orders
  alter column buyer_email drop not null;

alter table public.orders
  drop constraint if exists orders_entered_by_check,
  drop constraint if exists orders_payment_method_check,
  drop constraint if exists orders_parent_enters_cash_only,
  drop constraint if exists orders_buyer_contact_check,
  drop constraint if exists orders_card_requires_email,
  drop constraint if exists orders_cash_received_consistent,
  drop constraint if exists orders_cash_paid_needs_remittance,
  drop constraint if exists orders_card_no_cash_collection,
  drop constraint if exists orders_cash_received_amount,
  drop constraint if exists orders_buyer_phone_check,
  drop constraint if exists orders_buyer_phone_na_check;

alter table public.orders
  add constraint orders_entered_by_check
    check (entered_by in ('supporter', 'parent')),
  add constraint orders_payment_method_check
    check (payment_method in ('card', 'cash')),
  add constraint orders_parent_enters_cash_only
    check (entered_by <> 'parent' or payment_method = 'cash'),
  add constraint orders_buyer_contact_check
    check (
      length(btrim(buyer_name)) > 0
      and (
        (buyer_email is not null and length(btrim(buyer_email)) > 0)
        or (buyer_phone is not null and length(btrim(buyer_phone)) > 0)
      )
    ),
  add constraint orders_card_requires_email
    check (
      payment_method <> 'card'
      or (buyer_email is not null and length(btrim(buyer_email)) > 0)
    ),
  add constraint orders_cash_received_consistent
    check (
      (
        cash_received_at is null
        and cash_received_cents is null
        and cash_received_by is null
        and cash_receipt_token is null
        and cash_receipt_sent_at is null
      )
      or (
        payment_method = 'cash'
        and cash_received_at is not null
        and cash_received_cents is not null
        and cash_received_by is not null
        and length(btrim(cash_received_by)) > 0
        and cash_receipt_token is not null
        and length(cash_receipt_token) >= 32
      )
    ),
  add constraint orders_cash_received_amount
    check (cash_received_cents is null or cash_received_cents = total_cad),
  add constraint orders_cash_paid_needs_remittance
    check (
      payment_method <> 'cash'
      or payment_status <> 'paid'
      or remittance_id is not null
    ),
  add constraint orders_card_no_cash_collection
    check (
      payment_method <> 'card'
      or (
        cash_received_at is null
        and remittance_id is null
      )
    );

-- North American phone when present: 10 digits after stripping symbols, or
-- 11 digits starting with 1. NOT VALID so the existing row is not rewritten.
alter table public.orders
  add constraint orders_buyer_phone_na_check
    check (
      buyer_phone is null
      or length(btrim(buyer_phone)) = 0
      or (
        length(buyer_phone) <= 40
        and (
          length(regexp_replace(buyer_phone, '[^0-9]', '', 'g')) = 10
          or (
            length(regexp_replace(buyer_phone, '[^0-9]', '', 'g')) = 11
            and left(regexp_replace(buyer_phone, '[^0-9]', '', 'g'), 1) = '1'
          )
        )
      )
    ) not valid;

-- Chris's three ledger labels. Card rows that are not yet paid (or were
-- refunded) leave this null so the ledger can show them as pending/refunded
-- from payment_status instead. Cancelled cash (payment_status failed) is
-- also null, not cash_owed.
alter table public.orders
  add column if not exists ledger_payment_status text
    generated always as (
      case
        when payment_method = 'card' and payment_status = 'paid' then 'card_paid'
        when payment_method = 'cash' and payment_status in ('failed', 'refunded') then null
        when payment_method = 'cash' and cash_received_at is not null then 'cash_received'
        when payment_method = 'cash' then 'cash_owed'
        else null
      end
    ) stored;

alter table public.orders
  drop constraint if exists orders_ledger_payment_status_check;
alter table public.orders
  add constraint orders_ledger_payment_status_check
    check (
      ledger_payment_status is null
      or ledger_payment_status in ('card_paid', 'cash_owed', 'cash_received')
    );

create unique index if not exists orders_cash_receipt_token_key
  on public.orders (cash_receipt_token)
  where cash_receipt_token is not null;

create index if not exists orders_cp_idx on public.orders (cp_id);
create index if not exists orders_remittance_idx
  on public.orders (remittance_id)
  where remittance_id is not null;
create index if not exists orders_cash_due_idx
  on public.orders (cp_id)
  where payment_method = 'cash' and cash_received_at is not null and remittance_id is null;

comment on column public.orders.cp_id is
  'The one participant/parent ledger this order is credited to. All order_lines.cp_id must match.';
comment on column public.orders.entered_by is
  'supporter = placed through the parent share link; parent = typed in by the parent (paper/cash case).';
comment on column public.orders.ledger_payment_status is
  'Parent-facing status: card_paid, cash_owed, or cash_received. Settlement with SSF stays on payment_status.';
comment on column public.orders.is_test is
  'Default true, same idea as bundle_offers.is_test. Set false only by the app at insert time in approved Production, never by this migration. That path must exist before any production use.';

-- ---------------------------------------------------------------------------
-- Line items must belong to the order's one participant
-- ---------------------------------------------------------------------------
create or replace function public.fn_order_lines_guard()
returns trigger
language plpgsql
set search_path to ''
as $function$
declare
  v_status     text;
  v_campaign   uuid;
  v_cp         uuid;
  v_share      int;
  v_received   timestamptz;
  v_locked     boolean;
begin
  -- Lock lines only once cash is marked received, or once the order is paid.
  -- cash_owed orders must still accept line inserts at create time.
  if tg_op in ('UPDATE', 'DELETE') then
    select o.payment_status::text, o.cash_received_at
      into v_status, v_received
      from public.orders o where o.order_id = old.order_id;
    v_locked := (v_status = 'paid' or v_received is not null);
    if v_locked then
      raise exception 'Order % is locked: its lines cannot be changed', old.order_id;
    end if;
    if tg_op = 'DELETE' then
      return old;
    end if;
  end if;

  select o.payment_status::text, o.campaign_id, o.cp_id, o.cash_received_at
    into v_status, v_campaign, v_cp, v_received
    from public.orders o where o.order_id = new.order_id;
  v_locked := (v_status = 'paid' or v_received is not null);
  if v_locked then
    raise exception 'Order % is locked: add lines only while it is cash owed or a pending card order', new.order_id;
  end if;

  if v_cp is not null and new.cp_id <> v_cp then
    raise exception 'Line participant % does not match this ledger (%)', new.cp_id, v_cp;
  end if;

  if not exists (
    select 1 from public.campaign_participants cp
     where cp.cp_id = new.cp_id and cp.campaign_id = v_campaign
  ) then
    raise exception 'Player % is not on the roster of campaign %', new.cp_id, v_campaign;
  end if;

  -- Insert-time check against the current per-bag share. The line still
  -- snapshots team_share_cents so later bag_type edits do not rewrite history.
  select bt.team_share_cents into v_share
    from public.bag_types bt where bt.bag_type_id = new.bag_type_id;
  if new.team_share_cents <> new.qty * v_share then
    raise exception 'Line team share % <> qty % x per-bag team share %',
      new.team_share_cents, new.qty, v_share;
  end if;

  return new;
end
$function$;

create or replace function public.fn_block_paid_order_delete()
returns trigger
language plpgsql
set search_path to ''
as $function$
begin
  if old.payment_status = 'paid'
     or old.cash_received_at is not null
     or old.remittance_id is not null then
    raise exception
      'Order % cannot be deleted once it is paid, cash-received, or attached to a remittance',
      old.order_id;
  end if;
  return old;
end
$function$;

-- ---------------------------------------------------------------------------
-- Leaderboard: ranks follow the config flag; campaign totals stay settled
-- ---------------------------------------------------------------------------
create or replace function public.fn_recalc_leaderboard(p_campaign uuid)
returns void
language plpgsql
set search_path to ''
as $function$
declare
  v_mode text;
begin
  select coalesce(pc.value #>> '{}', 'when_remitted')
    into v_mode
    from public.platform_config pc
   where pc.key = 'leaderboard_cash_counting';
  v_mode := coalesce(v_mode, 'when_remitted');

  -- Recompute participant bags from qualifying orders so option A cannot
  -- double-count when a remittance later sets payment_status to paid.
  -- Campaign team_raised_cents / total_raised_cad stay on fn_apply_paid_order
  -- (settled money only).
  with qualifying as (
    select ol.cp_id,
           sum(ol.qty)::int as bags,
           sum(ol.gross_cents)::int as gross,
           sum(ol.team_share_cents)::int as team
      from public.orders o
      join public.order_lines ol on ol.order_id = o.order_id
     where o.campaign_id = p_campaign
       and o.payment_status <> 'refunded'
       and (
         o.payment_status = 'paid'
         or (
           v_mode = 'when_received'
           and o.payment_method = 'cash'
           and o.cash_received_at is not null
         )
       )
     group by ol.cp_id
  )
  update public.campaign_participants cp
     set bags_sold          = coalesce(q.bags, 0),
         revenue_cad        = coalesce(q.gross, 0),
         team_revenue_cents = coalesce(q.team, 0)
    from public.campaign_participants cur
    left join qualifying q on q.cp_id = cur.cp_id
   where cur.campaign_id = p_campaign
     and cp.cp_id = cur.cp_id;

  with ranked as (
    select cp_id,
           rank() over (
             order by bags_sold desc, team_revenue_cents desc, revenue_cad desc, registered_at asc
           ) as r
      from public.campaign_participants
     where campaign_id = p_campaign
  )
  update public.campaign_participants cp
     set campaign_rank = ranked.r,
         is_top3_campaign = (ranked.r <= 3 and cp.bags_sold > 0)
    from ranked
   where cp.cp_id = ranked.cp_id;

  with today_sales as (
    select ol.cp_id,
           sum(ol.qty) as bags_today,
           sum(ol.gross_cents) as rev_today,
           sum(ol.team_share_cents) as team_today
      from public.orders o
      join public.order_lines ol on ol.order_id = o.order_id
     where o.campaign_id = p_campaign
       and o.payment_status <> 'refunded'
       and (
         (
           o.payment_status = 'paid'
           and o.order_date = (now() at time zone 'America/Edmonton')::date
         )
         or (
           v_mode = 'when_received'
           and o.payment_method = 'cash'
           and o.cash_received_at is not null
           and o.payment_status <> 'paid'
           and (o.cash_received_at at time zone 'America/Edmonton')::date
               = (now() at time zone 'America/Edmonton')::date
         )
       )
     group by ol.cp_id
  ),
  ranked as (
    select cp.cp_id,
           coalesce(t.bags_today, 0) as bags_today,
           rank() over (
             order by coalesce(t.bags_today, 0) desc,
                      coalesce(t.team_today, 0) desc,
                      coalesce(t.rev_today, 0) desc,
                      cp.registered_at asc
           ) as r
      from public.campaign_participants cp
      left join today_sales t on t.cp_id = cp.cp_id
     where cp.campaign_id = p_campaign
  )
  update public.campaign_participants cp
     set daily_rank = ranked.r,
         is_top3_today = (ranked.r <= 3 and ranked.bags_today > 0)
    from ranked
   where cp.cp_id = ranked.cp_id;

  update public.families f
     set prize_draw_eligible = true
    from public.campaign_participants cp
   where cp.family_id = f.family_id
     and cp.campaign_id = p_campaign
     and cp.is_top3_campaign = true;
end
$function$;

-- fn_apply_paid_order still increments campaign totals and family bags when
-- payment_status becomes paid (or reverses them on a refund). It no longer
-- increments participant bags_sold / revenue_cad / team_revenue_cents.
-- fn_recalc_leaderboard is the source of truth for those three columns, and
-- this trigger calls it whenever payment_status enters or leaves 'paid' so
-- the card webhook, remittance webhook, refunds, and admin edits cannot skip
-- it. Other callers may still invoke recalc; a second rebuild is harmless.
create or replace function public.fn_apply_paid_order()
returns trigger
language plpgsql
set search_path to ''
as $function$
declare
  r        public.orders%rowtype;
  v_dir    int := 0;
  v_lines  int;
  v_bags   int;
  v_gross  int;
  v_team   int;
begin
  if (tg_op = 'INSERT' and new.payment_status = 'paid')
     or (tg_op = 'UPDATE' and new.payment_status = 'paid' and old.payment_status <> 'paid') then
    v_dir := 1;  r := new;
  elsif tg_op = 'UPDATE' and old.payment_status = 'paid' and new.payment_status <> 'paid' then
    v_dir := -1; r := old;
  end if;

  if v_dir = 0 then
    return new;
  end if;

  select count(*), coalesce(sum(ol.qty), 0), coalesce(sum(ol.gross_cents), 0),
         coalesce(sum(ol.team_share_cents), 0)
    into v_lines, v_bags, v_gross, v_team
    from public.order_lines ol where ol.order_id = r.order_id;

  if v_lines = 0 then
    raise exception 'Order % has no order_lines: insert it as pending with its lines, then mark paid', r.order_id;
  end if;
  if v_bags <> r.total_bags or v_gross <> r.total_cad then
    raise exception 'Order % totals (% bags, % cents) do not match its lines (% bags, % cents)',
      r.order_id, r.total_bags, r.total_cad, v_bags, v_gross;
  end if;

  update public.campaigns c
     set total_raised_cad  = greatest(0, c.total_raised_cad  + v_dir * v_gross),
         team_raised_cents = greatest(0, c.team_raised_cents + v_dir * v_team)
   where c.campaign_id = r.campaign_id;

  update public.families f
     set total_bags_sold = greatest(0, f.total_bags_sold + v_dir * l.bags)
    from (
      select cp.family_id, sum(ol.qty)::int as bags
        from public.order_lines ol
        join public.campaign_participants cp on cp.cp_id = ol.cp_id
       where ol.order_id = r.order_id
       group by cp.family_id
    ) l
   where f.family_id = l.family_id;

  perform public.fn_recalc_leaderboard(r.campaign_id);

  return new;
end
$function$;

-- ---------------------------------------------------------------------------
-- Remittance deadline. Change platform_config.remittance_deadline, not this
-- function's fallback. campaign_cutoff uses campaigns.end_date.
-- ---------------------------------------------------------------------------
create or replace function public.fn_remittance_deadline(p_end_date date)
returns date
language plpgsql
stable
set search_path to ''
as $function$
declare
  v_value jsonb;
  v_mode text;
  v_days int;
  v_fixed text;
begin
  select pc.value into v_value
    from public.platform_config pc
   where pc.key = 'remittance_deadline';

  v_mode := coalesce(v_value->>'mode', 'campaign_cutoff');

  if v_mode = 'fixed_date' then
    v_fixed := v_value->>'date';
    if v_fixed ~ '^\d{4}-\d{2}-\d{2}$' then
      return v_fixed::date;
    end if;
  elsif v_mode = 'days_after_cutoff' and p_end_date is not null then
    v_days := coalesce((v_value->>'days')::int, 0);
    return p_end_date + v_days;
  end if;

  return p_end_date;
end
$function$;

comment on function public.fn_remittance_deadline(date) is
  'Last date a cash remittance can clear and still be packed. Default mode campaign_cutoff uses the campaign order cut-off. Edit platform_config.remittance_deadline to change it.';

-- Card sales are packed when paid. Cash is packed only when remitted on or
-- before fn_remittance_deadline. Unremitted cash fails this check.
create or replace function public.fn_cash_in_production(
  p_method text,
  p_paid_at timestamptz,
  p_end_date date
) returns boolean
language sql
stable
set search_path to ''
as $function$
  select p_method is distinct from 'cash'
     or (
       p_paid_at is not null
       and (p_paid_at at time zone 'America/Edmonton')::date
           <= public.fn_remittance_deadline(p_end_date)
     );
$function$;

revoke all on function public.fn_remittance_deadline(date) from public, anon;
revoke all on function public.fn_cash_in_production(text, timestamptz, date) from public, anon;
grant execute on function public.fn_remittance_deadline(date) to authenticated, service_role;
grant execute on function public.fn_cash_in_production(text, timestamptz, date) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Team order / pick list / production: paid, and cash only if remitted in time.
-- ---------------------------------------------------------------------------
create or replace view public.v_organizer_pick_list
  with (security_invoker = true)
as
select o.campaign_id,
       cp.cp_id,
       cp.family_id,
       cp.player_first_name,
       cp.player_last_name,
       o.order_id,
       o.buyer_name,
       o.buyer_email,
       o.buyer_phone,
       o.created_at as ordered_at,
       ol.product_id,
       coalesce(spn.display_name, p.name) as candy_name,
       p.name as base_candy,
       bt.code as bag_type_code,
       sum(ol.qty)::integer as bags,
       bool_or(ol.from_mix_pack) as includes_mix_pack,
       o.entered_by,
       o.payment_method,
       o.ledger_payment_status,
       o.remittance_id
  from public.orders o
  join public.order_lines ol on ol.order_id = o.order_id
  join public.campaign_participants cp on cp.cp_id = ol.cp_id
  join public.products p on p.product_id = ol.product_id
  join public.bag_types bt on bt.bag_type_id = ol.bag_type_id
  join public.campaigns c on c.campaign_id = o.campaign_id
  left join public.parent_remittances pr on pr.remittance_id = o.remittance_id
  left join public.sports s on s.sport_name = c.sport
  left join public.sport_product_names spn
    on spn.sport_id = s.sport_id and spn.product_id = ol.product_id
 where o.payment_status = 'paid'::public.payment_status
   and public.fn_cash_in_production(o.payment_method, pr.paid_at, c.end_date)
 group by o.campaign_id, cp.cp_id, cp.family_id, cp.player_first_name, cp.player_last_name,
          o.order_id, o.buyer_name, o.buyer_email, o.buyer_phone, o.created_at,
          ol.product_id, spn.display_name, p.name, bt.code,
          o.entered_by, o.payment_method, o.ledger_payment_status, o.remittance_id;

create or replace view public.v_campaign_production_totals
  with (security_invoker = true)
as
select o.campaign_id,
       ol.product_id,
       p.name as product_name,
       ol.bag_type_id,
       bt.code as bag_type_code,
       sum(ol.qty)::integer as bags,
       count(distinct o.order_id) as orders
  from public.orders o
  join public.campaigns c on c.campaign_id = o.campaign_id
  join public.order_lines ol on ol.order_id = o.order_id
  join public.products p on p.product_id = ol.product_id
  join public.bag_types bt on bt.bag_type_id = ol.bag_type_id
  left join public.parent_remittances pr on pr.remittance_id = o.remittance_id
 where o.payment_status = 'paid'::public.payment_status
   and public.fn_cash_in_production(o.payment_method, pr.paid_at, c.end_date)
 group by o.campaign_id, ol.product_id, p.name, ol.bag_type_id, bt.code;

create or replace view public.v_kpi_bags_per_order
  with (security_invoker = true)
as
select o.campaign_id,
       count(*)::integer as paid_orders,
       sum(o.total_bags)::integer as bags,
       round(avg(o.total_bags), 2) as avg_bags_per_order,
       round(avg(o.total_cad))::integer as avg_order_gross_cents
  from public.orders o
  join public.campaigns c on c.campaign_id = o.campaign_id
  left join public.parent_remittances pr on pr.remittance_id = o.remittance_id
 where o.payment_status = 'paid'::public.payment_status
   and public.fn_cash_in_production(o.payment_method, pr.paid_at, c.end_date)
 group by grouping sets ((o.campaign_id), ());

-- Held cash (visible to admin / parent ledger, never packed yet):
--   payment_method = 'cash' and payment_status <> 'paid'
-- Ready to pack (the team order):
--   payment_status = 'paid' and fn_cash_in_production(...)
-- Cash remitted after the deadline stays paid for the ledger note, but it is
-- not in these views.

-- ---------------------------------------------------------------------------
-- Private RPCs (service role only). Next.js routes check the parent token,
-- then call these. Not exposed to anon.
-- ---------------------------------------------------------------------------
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to postgres, service_role;

create or replace function private.fn_parent_from_token(p_token text)
returns public.campaign_participants
language sql
stable
security definer
set search_path to ''
as $function$
  -- Ledger / remittance / private leaderboard only. share_token must not match.
  select cp.*
    from public.campaign_participants cp
   where cp.parent_token = p_token
     and length(p_token) >= 32
     and cp.share_token is distinct from p_token;
$function$;

-- Supporter shop lookup. Resolves share_token only. parent_token never matches.
-- Returns only what the server needs to run the shop. The /s/ page and any
-- client JSON must expose only player_first_name and campaign_name (the team).
-- Never returns parent_token, family, contacts, orders or totals.
create or replace function private.fn_shop_from_share_token(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_out jsonb;
begin
  if p_token is null or length(p_token) < 32 then
    raise exception 'Link not valid' using errcode = '28000';
  end if;

  select jsonb_build_object(
    'cp_id', cp.cp_id,
    'campaign_id', cp.campaign_id,
    'player_first_name', cp.player_first_name,
    'campaign_name', c.campaign_name,
    'team_slug', c.team_slug,
    'status', c.status,
    'start_date', c.start_date,
    'end_date', c.end_date
  )
    into v_out
    from public.campaign_participants cp
    join public.campaigns c on c.campaign_id = cp.campaign_id
   where cp.share_token = p_token
     and cp.parent_token is distinct from p_token;

  if v_out is null then
    raise exception 'Link not valid' using errcode = '28000';
  end if;
  return v_out;
end
$function$;

-- Admin only (route must check is_admin). Kills the old /s/ link. Leaves
-- parent_token and the ledger untouched.
create or replace function private.fn_admin_rotate_share_token(p_cp_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_new text;
  v_parent text;
begin
  select parent_token into v_parent
    from public.campaign_participants
   where cp_id = p_cp_id
   for update;
  if v_parent is null then
    raise exception 'Participant not found' using errcode = '22023';
  end if;

  loop
    v_new := replace(gen_random_uuid()::text, '-'::text, ''::text);
    exit when v_new is distinct from v_parent and length(v_new) >= 32;
  end loop;

  update public.campaign_participants
     set share_token = v_new
   where cp_id = p_cp_id;

  return jsonb_build_object('cp_id', p_cp_id, 'share_token', v_new);
end
$function$;

-- Ledger payload for the owning parent. Includes supporter contact. Never
-- grant this to anon; the page is a server route.
create or replace function private.fn_parent_ledger(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_me public.campaign_participants;
  v_out jsonb;
begin
  select * into v_me from private.fn_parent_from_token(p_token);
  if v_me.cp_id is null then
    raise exception 'Link not valid' using errcode = '28000';
  end if;

  select jsonb_build_object(
    'cp_id', v_me.cp_id,
    'campaign_id', v_me.campaign_id,
    'family_id', v_me.family_id,
    'player_first_name', v_me.player_first_name,
    'card_paid_cents', coalesce((
      select sum(o.total_cad) from public.orders o
       where o.cp_id = v_me.cp_id
         and o.ledger_payment_status = 'card_paid'
    ), 0),
    'cash_owed_cents', coalesce((
      select sum(o.total_cad) from public.orders o
       where o.cp_id = v_me.cp_id
         and o.ledger_payment_status = 'cash_owed'
    ), 0),
    'cash_collected_cents', coalesce((
      select sum(o.cash_received_cents) from public.orders o
       where o.cp_id = v_me.cp_id
         and o.ledger_payment_status = 'cash_received'
    ), 0),
    'cash_due_to_ssf_cents', coalesce((
      select sum(o.cash_received_cents) from public.orders o
       where o.cp_id = v_me.cp_id
         and o.payment_method = 'cash'
         and o.cash_received_at is not null
         and o.payment_status = 'pending'
    ), 0),
    'orders', coalesce((
      select jsonb_agg(row_to_json(x) order by x.created_at)
      from (
        select o.order_id,
               o.created_at,
               o.entered_by,
               o.payment_method,
               o.payment_status,
               o.ledger_payment_status,
               (o.payment_status = 'paid') as paid_to_ssf,
               o.buyer_name,
               o.buyer_email,
               o.buyer_phone,
               o.total_bags,
               o.total_cad,
               o.cash_received_at,
               o.cash_received_cents,
               o.cash_received_by,
               o.cash_receipt_token,
               o.remittance_id,
               r.status as remittance_status,
               o.line_items
          from public.orders o
          left join public.parent_remittances r on r.remittance_id = o.remittance_id
         where o.cp_id = v_me.cp_id
      ) x
    ), '[]'::jsonb)
  ) into v_out;

  return v_out;
end
$function$;

-- Parent taps "cash received". Idempotent if already recorded at the same amount.
create or replace function private.fn_mark_cash_received(
  p_token text,
  p_order_id uuid,
  p_amount_cents integer,
  p_collected_by text
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_me     public.campaign_participants;
  v_order  public.orders%rowtype;
  v_who    text;
  v_token  text;
  v_family public.families%rowtype;
begin
  select * into v_me from private.fn_parent_from_token(p_token);
  if v_me.cp_id is null then
    raise exception 'Link not valid' using errcode = '28000';
  end if;

  select * into v_order from public.orders o
   where o.order_id = p_order_id
     and o.cp_id = v_me.cp_id
   for update;
  if v_order.order_id is null then
    raise exception 'Order not found on this ledger' using errcode = '22023';
  end if;
  if v_order.payment_method <> 'cash' then
    raise exception 'Only cash orders can be marked received' using errcode = '22023';
  end if;
  if v_order.payment_status = 'refunded' then
    raise exception 'That order was cancelled' using errcode = '22023';
  end if;
  if p_amount_cents is distinct from v_order.total_cad then
    raise exception 'Received amount must match the order total' using errcode = '22023';
  end if;

  if v_order.cash_received_at is not null then
    return jsonb_build_object(
      'order_id', v_order.order_id,
      'already_received', true,
      'cash_receipt_token', v_order.cash_receipt_token
    );
  end if;

  select * into v_family from public.families f where f.family_id = v_me.family_id;
  v_who := nullif(btrim(coalesce(p_collected_by, '')), '');
  if v_who is null then
    v_who := btrim(coalesce(v_family.parent_first_name, '') || ' ' || coalesce(v_family.parent_last_name, ''));
  end if;
  if v_who is null or v_who = '' then
    v_who := 'Parent';
  end if;

  v_token := replace(gen_random_uuid()::text, '-', '');

  update public.orders
     set cash_received_at = now(),
         cash_received_cents = p_amount_cents,
         cash_received_by = v_who,
         cash_receipt_token = v_token,
         updated_at = now()
   where order_id = v_order.order_id;

  perform public.fn_recalc_leaderboard(v_me.campaign_id);

  return jsonb_build_object(
    'order_id', v_order.order_id,
    'already_received', false,
    'cash_receipt_token', v_token,
    'buyer_email', v_order.buyer_email,
    'has_email', v_order.buyer_email is not null and length(btrim(v_order.buyer_email)) > 0,
    'has_phone_only',
      (v_order.buyer_email is null or length(btrim(v_order.buyer_email)) = 0)
      and v_order.buyer_phone is not null
  );
end
$function$;

-- Open or reuse the one pending remittance for this participant. Amount is
-- the cash-received orders still pending (including those already attached
-- to this remittance). The app starts Stripe for method = card; if the
-- amount changed on reuse it must create a new session.
create or replace function private.fn_open_cash_remittance(
  p_token text,
  p_method text default 'card'
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_me       public.campaign_participants;
  v_due      int;
  v_id       uuid;
  v_method   text;
  v_existing public.parent_remittances%rowtype;
  v_prev     int;
  v_reused   boolean := false;
begin
  select * into v_me from private.fn_parent_from_token(p_token);
  if v_me.cp_id is null then
    raise exception 'Link not valid' using errcode = '28000';
  end if;

  v_method := coalesce(nullif(p_method, ''), 'card');
  if v_method not in ('card', 'etransfer') then
    raise exception 'Unsupported remittance method' using errcode = '22023';
  end if;
  -- Pilot: the app starts a Stripe checkout for method = card. etransfer is
  -- accepted in the column but should not be offered in the UI yet.

  select * into v_existing
    from public.parent_remittances r
   where r.cp_id = v_me.cp_id
     and r.status = 'pending'
   for update;

  select coalesce(sum(o.cash_received_cents), 0) into v_due
    from public.orders o
   where o.cp_id = v_me.cp_id
     and o.payment_method = 'cash'
     and o.cash_received_at is not null
     and o.payment_status = 'pending'
     and (o.remittance_id is null or o.remittance_id = v_existing.remittance_id);

  if v_due <= 0 then
    if v_existing.remittance_id is not null then
      update public.parent_remittances
         set status = 'failed',
             updated_at = now()
       where remittance_id = v_existing.remittance_id
         and status = 'pending';
      update public.orders
         set remittance_id = null,
             updated_at = now()
       where remittance_id = v_existing.remittance_id
         and payment_status = 'pending';
    end if;
    raise exception 'There is no collected cash due right now' using errcode = '22023';
  end if;

  if v_existing.remittance_id is not null then
    v_reused := true;
    v_id := v_existing.remittance_id;
    v_prev := v_existing.amount_cents;
    update public.parent_remittances
       set amount_cents = v_due,
           method = v_method,
           updated_at = now()
     where remittance_id = v_id;
  else
    insert into public.parent_remittances (
      campaign_id, cp_id, family_id, amount_cents, method, status, is_test
    ) values (
      v_me.campaign_id, v_me.cp_id, v_me.family_id, v_due, v_method, 'pending', true
    )
    returning remittance_id into v_id;
    v_prev := v_due;
  end if;

  update public.orders
     set remittance_id = v_id,
         updated_at = now()
   where cp_id = v_me.cp_id
     and payment_method = 'cash'
     and cash_received_at is not null
     and payment_status = 'pending'
     and (remittance_id is null or remittance_id = v_id);

  return jsonb_build_object(
    'remittance_id', v_id,
    'amount_cents', v_due,
    'previous_amount_cents', v_prev,
    'amount_changed', v_due is distinct from v_prev,
    'reused', v_reused,
    'method', v_method,
    'stripe_checkout_session_id', case when v_reused then v_existing.stripe_checkout_session_id else null end
  );
end
$function$;

-- Stripe webhook for a remittance checkout (metadata.kind = parent_remittance).
-- Marks the remittance paid, then sets those orders to payment_status = paid,
-- which includes them in the team pick list and campaign totals.
create or replace function private.fn_mark_remittance_paid(
  p_session_id text,
  p_payment_intent_id text
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_row public.parent_remittances%rowtype;
begin
  update public.parent_remittances
     set status = 'paid',
         paid_at = now(),
         stripe_payment_id = p_payment_intent_id,
         updated_at = now()
   where stripe_checkout_session_id = p_session_id
     and status = 'pending'
  returning * into v_row;

  if v_row.remittance_id is null then
    return null; -- already handled, or unknown session
  end if;

  update public.orders
     set payment_status = 'paid',
         updated_at = now()
   where remittance_id = v_row.remittance_id
     and payment_status = 'pending';

  -- Setting payment_status = paid also fires fn_apply_paid_order, which
  -- recalculates the leaderboard. This second call is harmless.
  perform public.fn_recalc_leaderboard(v_row.campaign_id);

  return jsonb_build_object(
    'remittance_id', v_row.remittance_id,
    'campaign_id', v_row.campaign_id,
    'amount_cents', v_row.amount_cents
  );
end
$function$;

-- Stripe checkout.session.expired, or a failed remittance payment. Only
-- matches the current session on a still-pending remittance, so an expiry
-- for a replaced session is a no-op. Clears remittance_id so the cash is due again.
create or replace function private.fn_fail_remittance(p_session_id text)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_row public.parent_remittances%rowtype;
begin
  if p_session_id is null or length(btrim(p_session_id)) = 0 then
    return null;
  end if;

  update public.parent_remittances
     set status = 'failed',
         updated_at = now()
   where stripe_checkout_session_id = p_session_id
     and status = 'pending'
  returning * into v_row;

  if v_row.remittance_id is null then
    return null;
  end if;

  update public.orders
     set remittance_id = null,
         updated_at = now()
   where remittance_id = v_row.remittance_id
     and payment_status = 'pending';

  return jsonb_build_object(
    'remittance_id', v_row.remittance_id,
    'campaign_id', v_row.campaign_id,
    'amount_cents', v_row.amount_cents
  );
end
$function$;

-- Parent cancels an uncollected cash-owed order (CEO default Q5).
create or replace function private.fn_cancel_cash_owed(p_token text, p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_me    public.campaign_participants;
  v_order public.orders%rowtype;
begin
  select * into v_me from private.fn_parent_from_token(p_token);
  if v_me.cp_id is null then
    raise exception 'Link not valid' using errcode = '28000';
  end if;

  select * into v_order from public.orders o
   where o.order_id = p_order_id
     and o.cp_id = v_me.cp_id
   for update;
  if v_order.order_id is null then
    raise exception 'Order not found on this ledger' using errcode = '22023';
  end if;
  if v_order.payment_method <> 'cash'
     or v_order.cash_received_at is not null
     or v_order.remittance_id is not null
     or v_order.payment_status <> 'pending' then
    raise exception 'Only an uncollected cash-owed order can be cancelled' using errcode = '22023';
  end if;

  update public.orders
     set payment_status = 'failed',
         updated_at = now()
   where order_id = v_order.order_id;

  return jsonb_build_object('order_id', v_order.order_id, 'payment_status', 'failed');
end
$function$;

-- Admin only (route must check is_admin). Undo cash received before remittance.
-- Full amount only; no partials (CEO default Q4).
create or replace function private.fn_admin_undo_cash_received(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_order public.orders%rowtype;
begin
  select * into v_order from public.orders o
   where o.order_id = p_order_id
   for update;
  if v_order.order_id is null then
    raise exception 'Order not found' using errcode = '22023';
  end if;
  if v_order.payment_method <> 'cash' or v_order.cash_received_at is null then
    raise exception 'That order is not cash received' using errcode = '22023';
  end if;
  if v_order.remittance_id is not null or v_order.payment_status <> 'pending' then
    raise exception 'Cash received can only be undone before remittance' using errcode = '22023';
  end if;

  update public.orders
     set cash_received_at = null,
         cash_received_cents = null,
         cash_received_by = null,
         cash_receipt_token = null,
         cash_receipt_sent_at = null,
         updated_at = now()
   where order_id = v_order.order_id;

  perform public.fn_recalc_leaderboard(v_order.campaign_id);

  return jsonb_build_object('order_id', v_order.order_id, 'ledger_payment_status', 'cash_owed');
end
$function$;

-- Receipt page uses cash_receipt_token only. Never returns parent_token or share_token.
create or replace function private.fn_receipt_by_token(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_out jsonb;
begin
  if p_token is null or length(p_token) < 32 then
    raise exception 'Link not valid' using errcode = '28000';
  end if;

  select jsonb_build_object(
    'order_id', o.order_id,
    'buyer_name', o.buyer_name,
    'total_cad', o.total_cad,
    'total_bags', o.total_bags,
    'cash_received_at', o.cash_received_at,
    'cash_received_by', o.cash_received_by,
    'line_items', o.line_items,
    'campaign_name', c.campaign_name
  )
    into v_out
    from public.orders o
    join public.campaigns c on c.campaign_id = o.campaign_id
   where o.cash_receipt_token = p_token
     and o.cash_received_at is not null;

  if v_out is null then
    raise exception 'Link not valid' using errcode = '28000';
  end if;
  return v_out;
end
$function$;

revoke all on function private.fn_parent_from_token(text) from public, anon, authenticated;
revoke all on function private.fn_shop_from_share_token(text) from public, anon, authenticated;
revoke all on function private.fn_admin_rotate_share_token(uuid) from public, anon, authenticated;
revoke all on function private.fn_parent_ledger(text) from public, anon, authenticated;
revoke all on function private.fn_mark_cash_received(text, uuid, integer, text) from public, anon, authenticated;
revoke all on function private.fn_open_cash_remittance(text, text) from public, anon, authenticated;
revoke all on function private.fn_mark_remittance_paid(text, text) from public, anon, authenticated;
revoke all on function private.fn_fail_remittance(text) from public, anon, authenticated;
revoke all on function private.fn_cancel_cash_owed(text, uuid) from public, anon, authenticated;
revoke all on function private.fn_admin_undo_cash_received(uuid) from public, anon, authenticated;
revoke all on function private.fn_receipt_by_token(text) from public, anon, authenticated;

grant execute on function private.fn_parent_from_token(text) to service_role;
grant execute on function private.fn_shop_from_share_token(text) to service_role;
grant execute on function private.fn_admin_rotate_share_token(uuid) to service_role;
grant execute on function private.fn_parent_ledger(text) to service_role;
grant execute on function private.fn_mark_cash_received(text, uuid, integer, text) to service_role;
grant execute on function private.fn_open_cash_remittance(text, text) to service_role;
grant execute on function private.fn_mark_remittance_paid(text, text) to service_role;
grant execute on function private.fn_fail_remittance(text) to service_role;
grant execute on function private.fn_cancel_cash_owed(text, uuid) to service_role;
grant execute on function private.fn_admin_undo_cash_received(uuid) to service_role;
grant execute on function private.fn_receipt_by_token(text) to service_role;

-- ---------------------------------------------------------------------------
-- RLS: same pattern as orders. No anon access. Admin via is_admin().
-- Service role bypasses RLS, which is how parent token routes already work.
-- ---------------------------------------------------------------------------
alter table public.parent_remittances enable row level security;

drop policy if exists "admin all access" on public.parent_remittances;
create policy "admin all access" on public.parent_remittances
  for all
  to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

revoke all on public.parent_remittances from anon, public;
grant select, insert, update, delete on public.parent_remittances to authenticated, service_role;

-- Views stay revoked from anon (buyer emails live on the pick list).
revoke all on public.v_organizer_pick_list from anon, public;
revoke all on public.v_campaign_production_totals from anon, public;
revoke all on public.v_kpi_bags_per_order from anon, public;
grant select on public.v_organizer_pick_list to authenticated, service_role;
grant select on public.v_campaign_production_totals to authenticated, service_role;
grant select on public.v_kpi_bags_per_order to authenticated, service_role;
