alter table public.area_waitlist
  add column consent_type text not null default 'implied' check (consent_type in ('implied','express')),
  add column express_consented_at timestamptz,
  add column express_consent_text text,
  add column keep_token text not null default encode(extensions.gen_random_bytes(32), 'hex');
create unique index area_waitlist_keep_token_key on public.area_waitlist (keep_token);
alter table public.area_waitlist add constraint area_waitlist_express_fields_chk check (consent_type = 'implied' or (express_consented_at is not null and express_consent_text is not null));
