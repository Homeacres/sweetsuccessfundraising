-- Activity names for the Apply dropdown. sport_product_names stay attached by sport_id.
-- New activities copy School's product names (School is the renamed Community/School row).

update public.sports set sport_name = 'Music or band' where sport_name = 'Music';
update public.sports set sport_name = 'School' where sport_name = 'Community/School';

update public.organizers set sport = 'Music or band' where sport = 'Music';
update public.organizers set sport = 'School' where sport = 'Community/School';
update public.campaigns set sport = 'Music or band' where sport = 'Music';
update public.campaigns set sport = 'School' where sport = 'Community/School';

update public.sports set sort_order = 22 where sport_name = 'Other';

insert into public.sports (sport_name, emoji, product_names, sort_order, is_active)
select 'Scouts or cadets', '⚜️', product_names, 20, true
from public.sports
where sport_name = 'School'
  and not exists (select 1 from public.sports where sport_name = 'Scouts or cadets');

insert into public.sports (sport_name, emoji, product_names, sort_order, is_active)
select 'Church or charity', '🕊️', product_names, 21, true
from public.sports
where sport_name = 'School'
  and not exists (select 1 from public.sports where sport_name = 'Church or charity');

insert into public.sport_product_names (sport_id, product_id, display_name)
select dest.sport_id, src_names.product_id, src_names.display_name
from public.sports dest
join public.sports src on src.sport_name = 'School'
join public.sport_product_names src_names on src_names.sport_id = src.sport_id
where dest.sport_name in ('Scouts or cadets', 'Church or charity')
  and not exists (
    select 1 from public.sport_product_names existing
    where existing.sport_id = dest.sport_id and existing.product_id = src_names.product_id
  );
