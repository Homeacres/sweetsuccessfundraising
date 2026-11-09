-- Proposal only. Do not apply until the owner chooses which bundles to sell.
-- No rows are inserted. Existing prices and products are unchanged.
-- Apply after 20261109140000_leaderboard_opt_in.sql.

-- A bundle is its own offer: a name, a price, and the team share for one of that offer.
-- The bags inside it stay real candies and bag types, so the pick list can still pack them.

create table if not exists public.bundle_offers (
  offer_id uuid primary key default gen_random_uuid(),
  label text not null,
  description text,
  price_cents integer not null,
  team_share_cents integer not null,
  is_active boolean not null default false,
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),
  constraint bundle_offers_price check (price_cents > 0),
  constraint bundle_offers_share check (team_share_cents >= 0)
);

create table if not exists public.bundle_offer_items (
  offer_id uuid not null references public.bundle_offers (offer_id) on delete cascade,
  product_id uuid not null references public.products (product_id),
  bag_type_id uuid not null references public.bag_types (bag_type_id),
  qty integer not null,
  primary key (offer_id, product_id, bag_type_id),
  constraint bundle_offer_items_qty check (qty > 0)
);

alter table public.bundle_offers enable row level security;
alter table public.bundle_offer_items enable row level security;

drop policy if exists "admin all access" on public.bundle_offers;
create policy "admin all access" on public.bundle_offers
  for all
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

drop policy if exists "admin all access" on public.bundle_offer_items;
create policy "admin all access" on public.bundle_offer_items
  for all
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

revoke all on public.bundle_offers from anon, authenticated;
revoke all on public.bundle_offer_items from anon, authenticated;
grant select, insert, update, delete on public.bundle_offers to service_role;
grant select, insert, update, delete on public.bundle_offer_items to service_role;

-- Lets a packed candy line remember which offer it came from.
-- The line itself stays a real candy and bag, which is what the pick list reads.
alter table public.order_lines
  add column if not exists bundle_offer_id uuid references public.bundle_offers (offer_id);
