# Sweet Success Fundraising

The Next.js app in this repository is the pilot shop. It is meant to be deployed on Vercel from this branch.

`index.html`, `CNAME`, and `api/*.js` are the current GitHub Pages site. The Next.js app does not use them. **Do not merge this branch into `main` until the DNS cutover is approved.** `main` keeps serving sweetsuccessfundraising.com.

## What the pilot does

- Organizers apply at `/`. The form is saved to `organizers` (or `out_of_area_log` when the postal code is outside `platform_config.service_provinces`). A Resend note goes to `ADMIN_EMAIL`. The CASL checkbox starts unchecked.
- Buyers order at `/t/{team_slug}` or `/t/{team_slug}/{player_slug}`. One order can be split across players. A mix pack is one bag of each active candy.
- Prices come from `fn_price_cart` on the server. The browser only previews.
- Stripe Checkout (test mode, CAD) charges the priced total. There is no shipping address.
- The Stripe webhook marks the order paid, sends a receipt, and rebuilds the leaderboard. A full refund marks the order refunded.
- Parents open `/l/{parent_token}`. `/unsubscribe/{parent_token}` opts that family out of campaign emails.
- A daily cron sends parent milestone emails. Closing a campaign from the admin page sends the close note.
- `/admin` shows production totals, a printable pick list, a CSV download, and a delivery form.

Family sign-up, payouts, NPS, daily top-seller mail, and team chat are not in this pilot. Campaigns, families, and players are created in Supabase. A shop link works once `campaigns.team_slug` is set, `campaigns.status` is `active`, and `campaign_participants` rows exist (with `families`).

## Pricing

Bags are sold one at a time. In `price_tiers`, only the qty=1 rows are active:

| Bag | Price | Team keeps |
| --- | --- | --- |
| Standard | $12 | $5 |
| Premium | $14 | $6 |

So 10 standard bags are $120, and a mix pack (one of each of the three candies) is 3 × $12 = $36. The 3/5/7/10 rows are still in the table with `is_active = false`. `fn_price_cart` ignores them. The shop reads active tiers only and does not draw a volume ladder unless an active tier has qty greater than 1. Turning those rows back on is enough for the same code to price them again; no schema change is required.

The bag estimate is not shown while the Apply form is being filled in. After a successful submit, the confirmation (and the applicant email, when sending is enabled) uses `bags = ceil((goal dollars / 5) / 10) * 10`. The goal is the team's share in dollars, and $5 of each bag goes to the team. `fundraising_goal_estimate_cad` is stored in cents, so that value is divided by 100 before the formula. "About X bags each" is `ceil(total bags / participants)`. This is a planning figure, not a checkout price.

## Names buyers see

The shop, cart, Stripe line item, success page, receipt, and parent emails use the sport-themed name from `sport_product_names`. They do not show `products.name`. Admin production totals and the pick list (screen and CSV) still show that source name. If a campaign's `sport` does not match `sports.sport_name`, or a product has no `sport_product_names` row, the shop leaves the candy title blank and the receipt says "Freeze-dried candy". The app does not read `sports.product_names` (those keys are Bag, Box, and Hat trick).

Dates shown to people use a shared formatter. A `YYYY-MM-DD` value stays on that calendar day. Timestamps are shown in America/Edmonton.

`fundraising_goal_estimate_cad` is stored in cents, matching `campaigns.goal_cad` and the other `*_cad` money columns.

## Setup

```bash
npm install
cp .env.example .env.local
# fill in .env.local
npm test
npm run dev
```

The app reads environment variables on the server, when a request needs them. `next build` does not connect to Supabase, Stripe, or Resend, so the build succeeds with none of these set. The browser is not given a Supabase key. Do not prefix `SUPABASE_SERVICE_ROLE_KEY` with `NEXT_PUBLIC_`.

### Environment variables

| Name | Purpose |
| --- | --- |
| `SUPABASE_URL` | Project URL (`https://iblzoubevkpurzmimguk.supabase.co`) |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only key. All writes, and reads of private tables, use this. |
| `NEXT_PUBLIC_APP_URL` | Public origin for Stripe return URLs and email links. Example: `http://localhost:3000` |
| `STRIPE_SECRET_KEY` | Test secret key. Must start with `sk_test_`. |
| `STRIPE_WEBHOOK_SECRET` | Signing secret (`whsec_...`) from the Stripe CLI or the Vercel webhook endpoint. |
| `RESEND_API_KEY` | Resend API key. |
| `RESEND_FROM` | From address on a domain verified in Resend. Example: `Sweet Success Fundraising <hello@sweetsuccessfundraising.com>` |
| `ADMIN_EMAIL` | Copy of an organizer application. If unset, the copy goes to obrien71@gmail.com. |
| `APPLY_EMAILS_ENABLED` | Apply emails send when this is `true`, `1`, or `yes` and `RESEND_API_KEY` is set. They also send when `EMAIL_TEST_RECIPIENT` is set. Otherwise nothing is sent. |
| `EMAIL_TEST_RECIPIENT` | Optional. Every email goes only to this address, with `[TEST to <original>] ` on the subject. `email_log.status` is `redirected`. The logged recipient stays the original address so milestone dedupe still works. |
| `ADMIN_PASSWORD` | Password for `/admin`. |
| `CRON_SECRET` | Bearer token for `/api/cron/milestones`. Vercel Cron sends it as `Authorization: Bearer ...`. |

## Stripe test-mode webhook

Use test keys only. The app rejects a live secret key.

1. `stripe login`
2. `npm run dev`
3. `stripe listen --forward-to localhost:3000/api/webhooks/stripe`
4. Copy the `whsec_...` value into `STRIPE_WEBHOOK_SECRET` and restart `npm run dev`.
5. Place an order with card `4242 4242 4242 4242`, any future expiry, any CVC, any postal code.
6. Confirm `orders.payment_status` is `paid`, a receipt arrived, and `fn_recalc_leaderboard` updated ranks.
7. Refund the payment in the Stripe Dashboard (test mode) or with `stripe refunds create --payment-intent pi_...`. The order should become `refunded` and the team totals should drop. A partial refund is ignored; the schema only has a whole-order refund.
8. In the Stripe CLI, resend `checkout.session.completed`. The handler should not send a second receipt.

On Vercel, add an endpoint `https://<your-domain>/api/webhooks/stripe` for the test-mode events `checkout.session.completed` and `charge.refunded`, and put that endpoint's signing secret in `STRIPE_WEBHOOK_SECRET`.

## Resend

`RESEND_FROM` has to use a domain you have verified in Resend (SPF and DKIM). Unverified domains only deliver to the Resend account address. Receipts are transactional and always send. Parent milestone mail is skipped when `families.email_opted_out_at` is set. The unsubscribe link is the visit itself: opening `/unsubscribe/{parent_token}` opts that family out.

## Vercel

1. Import the GitHub repo and set the production branch to this branch, not `main`, until DNS cutover.
2. Framework preset: Next.js. Root directory: the repository root (where `package.json` is). `vercel.json` pins `framework` to `nextjs` and `buildCommand` to `next build`, and it does not set `outputDirectory` (Next writes to `.next`). `package.json` `engines.node` is `22.x`. `.vercelignore` keeps the old `api/*.js` files off the upload so Vercel does not try to build those truncated scripts as functions. `index.html` and `CNAME` stay in git for GitHub Pages; Next serves `app/page.tsx` instead of `index.html`.
3. Add every variable from `.env.example`. The build does not need them. Requests that talk to Supabase, Stripe, or Resend read them at request time.
4. `vercel.json` schedules `GET /api/cron/milestones` at `0 16 * * *` (16:00 UTC, once a day). That is 9:00am when Edmonton is UTC−7 and 10:00am when it is UTC−6, so the 9:00 `send_hour_local` has passed either way. Set `CRON_SECRET` in the project; Vercel sends it on cron requests. Hobby plans allow a cron only when it runs at most once a day. This five-field expression matches that rule.
5. Do not point sweetsuccessfundraising.com at this deployment until you mean to replace the GitHub Pages site.

## Routes

| Route | Who |
| --- | --- |
| `/` | Landing and apply form |
| `/privacy` | Short privacy note |
| `/t/{team_slug}` | Team shop |
| `/t/{team_slug}/{player_slug}` | Same shop, that player preselected |
| `POST /api/apply` | Save an organizer application |
| `POST /api/checkout` | Price with `fn_price_cart`, insert a pending order, start Stripe Checkout |
| `/checkout/success`, `/checkout/cancelled` | Return pages. They do not mark an order paid. |
| `POST /api/webhooks/stripe` | `checkout.session.completed` and `charge.refunded` |
| `/l/{parent_token}` | Parent leaderboard via `fn_parent_leaderboard` |
| `/unsubscribe/{parent_token}` | Set `families.email_opted_out_at` |
| `GET /api/cron/milestones` | Due parent emails. Requires `CRON_SECRET`. |
| `/admin/login`, `/admin` | Campaign list |
| `/admin/campaigns/{id}` | Production totals, pick list, print, CSV, delivery, close |
| `GET /api/admin/campaigns/{id}/pick-list` | CSV download |

## Manual test (Stripe test mode)

1. In Supabase, create an organizer, an `active` campaign with `team_slug`, `start_date`, `end_date`, and `goal_cad` in cents, a family, and at least two `campaign_participants` (unique `player_slug`, `parent_token` filled by default). `campaigns.sport` must match `sports.sport_name` so themed candy names resolve.
2. Open `/t/{team_slug}/{player_slug}` on a phone-width window. The named player is selected. The first tap on a candy jumps to 3 (from `order_default_qty`). Standard shows $12 each and premium $14 each. There is no 3-for-$35 ladder.
3. Add a mix pack. The cart should show 3 bags and a preview of $36, with the team keeping $15. Add a bag for the second player in the same cart.
4. Check out with a test card. The Stripe total must match the preview. No shipping step.
5. After the webhook, the order is `paid`, the receipt lists each player, and `/l/{parent_token}` shows bags and team share. A bad token shows no names or totals.
6. Refund the whole payment. The order becomes `refunded` and the leaderboard drops. Send the webhook again and confirm only one receipt was sent.
7. Submit `/` with the consent box left unchecked. `organizers.consent_optin` is false. An Alberta postal code (starts with T) is required. A non-Alberta code is stored in `out_of_area_log` instead.
8. Sign in at `/admin`, open the campaign, print the pick list, download the CSV, and record a delivery. Mark the campaign closed and confirm a `parent_milestone_close` row in `email_log` for a parent who has not opted out.

## Schema notes (no migrations were applied)

- `organizers` has no postal-code column and no column for the consent sentence. The postal code is written into `notes`. Consent is `consent_optin` plus `consent_at`.
- `email_log` has no `order_id`. Buyer receipts are not covered by the parent-milestone unique index. A duplicate receipt is prevented by updating `payment_status` from `pending` to `paid` only once. If Resend fails after that update, a Stripe retry will not send the receipt again.
- The parent-milestone unique index is on `(campaign_id, lower(recipient), email_type)` with a partial predicate. PostgREST upsert cannot target that expression index, so the app inserts and treats Postgres `23505` as `ON CONFLICT DO NOTHING`. A send that fails after the insert is stored as `failed` and is not retried until that row is removed.
- `charge.refunded` is also emitted for partial refunds. Only `refunded = true` (the whole charge) sets `payment_status` to `refunded`.
- Refunds are matched on `orders.stripe_payment_id`, copied from the Checkout Session payment intent when the order is marked paid.
