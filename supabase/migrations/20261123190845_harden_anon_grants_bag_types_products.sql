-- Harden anon write grants on bag_types and products.
-- Keep grant select and policies:
--   "public read active bag types"
--   "public read active products"
-- Do not revoke authenticated grants.
-- Do not change price_tiers (anon already has SELECT only).

revoke insert, update, delete, truncate, references, trigger
  on table public.bag_types
  from anon;

revoke insert, update, delete, truncate, references, trigger
  on table public.products
  from anon;
