# Subscriber discount worker

Issues a **single-use Shopify discount code, valid 24 hours**, to a newsletter
subscriber who taps *Claim Your Code* in the welcome email.

The code is minted **on the click**, not at signup, so there is no race with
beehiiv's automation and no beehiiv webhook tier required. Only subscribers who
actually engage generate a code, which keeps Shopify → Discounts clean.

```
welcome email  →  /claim/?e={{email}}&c=<secret>  →  this Worker
                                                       ├─ Shopify: discountCodeBasicCreate (startsAt/endsAt, usageLimit 1)
                                                       └─ KV: one code per email, ever
                        ← { code, expiresAt } → claim page shows code + countdown
                                              → shop.folaadeleke.com/discount/<CODE>
```

## Pieces

| Path | What it is |
|---|---|
| `worker/src/index.js` | The Worker: `POST /claim`, `GET /health`, nightly cleanup cron |
| `claim/index.html` | Static claim page on folaadeleke.com (code / expired / error states) |
| `welcome-email.html` | Carries the *Claim Your Code* button |

## Setup

**1. Shopify custom app** — Admin → Settings → Apps and sales channels → Develop
apps → Create an app. Under Admin API scopes, tick `write_discounts` (and
`read_discounts`, needed by the cleanup cron). Install it and copy the Admin API
access token.

**2. KV namespace**

```sh
cd worker
npm install
npx wrangler kv namespace create CLAIMS
```

Paste the returned id into `wrangler.toml` (`REPLACE_WITH_KV_NAMESPACE_ID`) and
set `SHOPIFY_SHOP` to your `*.myshopify.com` domain.

**3. Secrets**

```sh
npx wrangler secret put SHOPIFY_ADMIN_TOKEN      # shpat_... from step 1
npx wrangler secret put CLAIM_SECRET             # e.g. openssl rand -hex 16
npx wrangler secret put BEEHIIV_API_KEY          # optional
npx wrangler secret put BEEHIIV_PUBLICATION_ID   # optional, pub_...
```

`CLAIM_SECRET` is the `?c=` value in the welcome-email link. It stops drive-by
traffic on `/claim/`; it is **not** a per-subscriber proof — the one-code-per-email
KV guard and `usageLimit: 1` are what bound abuse (see *Trade-offs*).

The two beehiiv values are optional. Set both and the Worker will only mint for
addresses that are active subscribers; leave them unset and any well-formed
address that has the campaign secret gets one code.

**4. Deploy**

```sh
npx wrangler deploy
```

**5. Wire up the front end** — in `claim/index.html`, set `WORKER_ENDPOINT` to
the deployed URL. In `welcome-email.html`, replace both
`REPLACE_WITH_CLAIM_SECRET` occurrences with the `CLAIM_SECRET` value, then
paste the email into beehiiv.

> **Verify before sending:** the email link uses `{{email}}` as beehiiv's merge
> tag. Confirm that syntax in your beehiiv account — send yourself a test and
> check the rendered link — because a tag that does not interpolate sends every
> subscriber to the same broken claim.

## Config (`wrangler.toml` `[vars]`)

| Var | Default | Notes |
|---|---|---|
| `DISCOUNT_PERCENTAGE` | `10` | Percent off, whole number |
| `DISCOUNT_HOURS` | `24` | Length of the window |
| `CODE_PREFIX` | `FA-WELCOME-` | Also how the cleanup cron identifies its own codes |
| `SHOPIFY_API_VERSION` | `2025-07` | Bump deliberately; check the mutation shape when you do |
| `ALLOWED_ORIGIN` | `https://folaadeleke.com` | CORS |

## Behaviour

- **First claim** → new code, 24h from now, `usageLimit: 1`.
- **Re-click inside the window** → the *same* code and the remaining countdown.
  Safe to reopen the email on another device.
- **Re-click after it lapses** → the expired state. No second code: the KV entry
  outlives the discount by 180 days.
- **Nightly at 02:15 UTC** → expired codes carrying `CODE_PREFIX` are deleted
  from Shopify. Hand-made admin codes are never touched.

## Trade-offs, stated plainly

- **The campaign secret is shareable.** Anyone who forwards the email link hands
  over a working claim URL. The damage is bounded — one code per email address
  ever, one use per code, 24h life — but a determined farmer with throwaway
  addresses can mint codes. Set `BEEHIIV_API_KEY`/`BEEHIIV_PUBLICATION_ID` to
  close that: then the address has to be an active subscriber first.
- **IP rate limiting is coarse** (8 attempts/hour/IP via KV). KV is eventually
  consistent, so treat it as friction, not a hard gate.
- **The 24h starts at click.** If you need it to start at signup, that is the
  webhook design instead, and it needs beehiiv webhook access plus a delay step
  in the automation to avoid the send race.

## Checks

The claim logic is covered by a dependency-free test that stubs KV and the
Shopify API — first claim, re-click inside the window, expiry, bad secret, rate
limit, and the cleanup filter:

```sh
npm test
```

Against a real deploy:

```sh
curl https://<worker>/health

curl -X POST https://<worker>/claim \
  -H 'Content-Type: application/json' \
  -d '{"email":"you@example.com","c":"<CLAIM_SECRET>"}'
```

Then confirm in Shopify → Discounts that the code exists with the right end
date, and that `shop.folaadeleke.com/discount/<CODE>` applies at checkout.
Run `npx wrangler tail` while testing to see errors.

**API shapes to verify against current docs** — `discountCodeBasicCreate`,
`discountCodeDelete`, the `codeDiscountNodes(query: "status:expired")` filter,
and beehiiv's `/v2/publications/{id}/subscriptions/by_email/{email}`. These are
written from the documented shapes at time of writing; Shopify moves API
versions quarterly.
