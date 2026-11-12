-- The Data API only exposes the public schema. These wrappers let the
-- service role call the private ledger functions. Anon and signed-in users
-- still have no execute right.

create or replace function public.fn_shop_from_share_token(p_token text)
returns jsonb
language sql
stable
security definer
set search_path to ''
as $function$
  select private.fn_shop_from_share_token(p_token);
$function$;

create or replace function public.fn_parent_from_token(p_token text)
returns public.campaign_participants
language sql
stable
security definer
set search_path to ''
as $function$
  select private.fn_parent_from_token(p_token);
$function$;

create or replace function public.fn_parent_ledger(p_token text)
returns jsonb
language sql
stable
security definer
set search_path to ''
as $function$
  select private.fn_parent_ledger(p_token);
$function$;

create or replace function public.fn_mark_cash_received(
  p_token text,
  p_order_id uuid,
  p_amount_cents integer,
  p_collected_by text
)
returns jsonb
language sql
security definer
set search_path to ''
as $function$
  select private.fn_mark_cash_received(p_token, p_order_id, p_amount_cents, p_collected_by);
$function$;

create or replace function public.fn_cancel_cash_owed(p_token text, p_order_id uuid)
returns jsonb
language sql
security definer
set search_path to ''
as $function$
  select private.fn_cancel_cash_owed(p_token, p_order_id);
$function$;

create or replace function public.fn_open_cash_remittance(p_token text, p_method text default 'card')
returns jsonb
language sql
security definer
set search_path to ''
as $function$
  select private.fn_open_cash_remittance(p_token, p_method);
$function$;

create or replace function public.fn_mark_remittance_paid(p_session_id text, p_payment_intent_id text)
returns jsonb
language sql
security definer
set search_path to ''
as $function$
  select private.fn_mark_remittance_paid(p_session_id, p_payment_intent_id);
$function$;

create or replace function public.fn_fail_remittance(p_session_id text)
returns jsonb
language sql
security definer
set search_path to ''
as $function$
  select private.fn_fail_remittance(p_session_id);
$function$;

create or replace function public.fn_admin_rotate_share_token(p_cp_id uuid)
returns jsonb
language sql
security definer
set search_path to ''
as $function$
  select private.fn_admin_rotate_share_token(p_cp_id);
$function$;

create or replace function public.fn_admin_undo_cash_received(p_order_id uuid)
returns jsonb
language sql
security definer
set search_path to ''
as $function$
  select private.fn_admin_undo_cash_received(p_order_id);
$function$;

create or replace function public.fn_receipt_by_token(p_token text)
returns jsonb
language sql
stable
security definer
set search_path to ''
as $function$
  select private.fn_receipt_by_token(p_token);
$function$;

revoke all on function public.fn_shop_from_share_token(text) from public, anon, authenticated;
revoke all on function public.fn_parent_from_token(text) from public, anon, authenticated;
revoke all on function public.fn_parent_ledger(text) from public, anon, authenticated;
revoke all on function public.fn_mark_cash_received(text, uuid, integer, text) from public, anon, authenticated;
revoke all on function public.fn_cancel_cash_owed(text, uuid) from public, anon, authenticated;
revoke all on function public.fn_open_cash_remittance(text, text) from public, anon, authenticated;
revoke all on function public.fn_mark_remittance_paid(text, text) from public, anon, authenticated;
revoke all on function public.fn_fail_remittance(text) from public, anon, authenticated;
revoke all on function public.fn_admin_rotate_share_token(uuid) from public, anon, authenticated;
revoke all on function public.fn_admin_undo_cash_received(uuid) from public, anon, authenticated;
revoke all on function public.fn_receipt_by_token(text) from public, anon, authenticated;

grant execute on function public.fn_shop_from_share_token(text) to service_role;
grant execute on function public.fn_parent_from_token(text) to service_role;
grant execute on function public.fn_parent_ledger(text) to service_role;
grant execute on function public.fn_mark_cash_received(text, uuid, integer, text) to service_role;
grant execute on function public.fn_cancel_cash_owed(text, uuid) to service_role;
grant execute on function public.fn_open_cash_remittance(text, text) to service_role;
grant execute on function public.fn_mark_remittance_paid(text, text) to service_role;
grant execute on function public.fn_fail_remittance(text) to service_role;
grant execute on function public.fn_admin_rotate_share_token(uuid) to service_role;
grant execute on function public.fn_admin_undo_cash_received(uuid) to service_role;
grant execute on function public.fn_receipt_by_token(text) to service_role;
