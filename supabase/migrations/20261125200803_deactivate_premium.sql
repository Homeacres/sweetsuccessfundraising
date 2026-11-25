update public.bag_types set is_active = false where code = 'premium' and is_active = true;
update public.price_tiers pt set is_active = false from public.bag_types bt where bt.bag_type_id = pt.bag_type_id and bt.code = 'premium' and pt.is_active = true;
update public.bundle_offers bo set is_active = false from public.bag_types bt where bt.bag_type_id = bo.bag_type_id and bt.code = 'premium' and bo.is_active = true;
comment on table public.price_tiers is 'Bundle price ladder per bag type. PILOT: only the standard qty=1 tier is active (single $12 bags). Premium is inactive (25 Nov 2026). Bundle tiers (3/5/7/10) stay inactive until production costs are measured; re-enable by setting is_active = true.';
