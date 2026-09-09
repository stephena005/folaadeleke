/**
 * ═══════════════════════════════════════════════════════════════
 * FOLA ADELEKE® — SUBSCRIBER DISCOUNT CLAIM WORKER
 * ═══════════════════════════════════════════════════════════════
 * Mints a single-use Shopify discount code, valid for 24 hours,
 * when a newsletter subscriber clicks the claim link in the
 * welcome email. One code per email address, ever.
 *
 *   POST /claim   { email, c }  -> { status, code, expiresAt }
 *   GET  /health                -> { ok: true }
 *   cron (daily)                -> deletes expired FA-WELCOME codes
 *
 * The 24 hours start at claim time, not signup — the code is
 * created on the click, so there is no window to miss.
 *
 * See README.md for setup, secrets and deploy.
 * ═══════════════════════════════════════════════════════════════
 */

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no O/0, I/1
const RATE_LIMIT_MAX = 8;          // claim attempts...
const RATE_LIMIT_WINDOW = 3600;    // ...per IP per hour
const CLAIM_MEMORY_TTL = 60 * 60 * 24 * 180; // remember a claim for 180 days

export default {
  async fetch(request, env, ctx) {
    const origin = env.ALLOWED_ORIGIN || 'https://folaadeleke.com';

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    const url = new URL(request.url);

    if (request.method === 'GET' && url.pathname === '/health') {
      return json({ ok: true }, 200, origin);
    }

    if (request.method !== 'POST' || url.pathname !== '/claim') {
      return json({ status: 'error', message: 'Not found' }, 404, origin);
    }

    try {
      return await handleClaim(request, env, origin);
    } catch (err) {
      console.error('claim failed', err && err.stack ? err.stack : err);
      return json({ status: 'error', message: 'Something went wrong. Try again shortly.' }, 500, origin);
    }
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(deleteExpiredCodes(env));
  },
};

/* ── claim ─────────────────────────────────────────────────── */

async function handleClaim(request, env, origin) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ status: 'error', message: 'Bad request.' }, 400, origin);
  }

  // The campaign secret sits in the welcome-email link. It stops
  // drive-by traffic on /claim; it is not a per-subscriber proof,
  // so the per-email guard below is what actually bounds abuse.
  if (!env.CLAIM_SECRET || !timingSafeEqual(String(body.c || ''), env.CLAIM_SECRET)) {
    return json({ status: 'invalid_link', message: 'This link is not valid.' }, 403, origin);
  }

  const email = normaliseEmail(body.email);
  if (!email) {
    return json({ status: 'invalid_email', message: 'That email address does not look right.' }, 400, origin);
  }

  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  if (await isRateLimited(env, ip)) {
    return json({ status: 'rate_limited', message: 'Too many attempts. Try again later.' }, 429, origin);
  }

  // Optional: only mint for addresses beehiiv actually knows about.
  if (env.BEEHIIV_API_KEY && env.BEEHIIV_PUBLICATION_ID) {
    const subscribed = await isBeehiivSubscriber(env, email);
    if (!subscribed) {
      return json({ status: 'not_subscribed', message: 'We could not find that address on the list.' }, 403, origin);
    }
  }

  const key = 'claim:' + (await sha256Hex(email));
  const existingRaw = await env.CLAIMS.get(key);

  if (existingRaw) {
    const existing = JSON.parse(existingRaw);
    if (Date.parse(existing.expiresAt) > Date.now()) {
      // Same code, same window — safe to re-open the email and click again.
      return json({ status: 'existing', code: existing.code, expiresAt: existing.expiresAt }, 200, origin);
    }
    return json({ status: 'expired', expiresAt: existing.expiresAt }, 200, origin);
  }

  const hours = Number(env.DISCOUNT_HOURS || 24);
  const startsAt = new Date();
  const endsAt = new Date(startsAt.getTime() + hours * 3600 * 1000);

  const created = await createDiscountCode(env, startsAt, endsAt);
  if (!created.ok) {
    return json({ status: 'error', message: 'Could not issue a code just now. Try again shortly.' }, 502, origin);
  }

  await env.CLAIMS.put(
    key,
    JSON.stringify({ code: created.code, expiresAt: endsAt.toISOString(), createdAt: startsAt.toISOString() }),
    { expirationTtl: CLAIM_MEMORY_TTL }
  );

  return json({ status: 'ok', code: created.code, expiresAt: endsAt.toISOString() }, 200, origin);
}

/* ── shopify ───────────────────────────────────────────────── */

const CREATE_MUTATION = `
  mutation createCode($discount: DiscountCodeBasicInput!) {
    discountCodeBasicCreate(basicCodeDiscount: $discount) {
      codeDiscountNode { id }
      userErrors { field code message }
    }
  }`;

async function createDiscountCode(env, startsAt, endsAt) {
  const prefix = env.CODE_PREFIX || 'FA-WELCOME-';
  const percentage = Number(env.DISCOUNT_PERCENTAGE || 10) / 100;

  // Collisions are vanishingly unlikely with 8 chars, but Shopify
  // rejects duplicates outright, so retry rather than fail the click.
  for (let attempt = 0; attempt < 3; attempt++) {
    const code = prefix + randomCode(8);
    const result = await shopifyGraphQL(env, CREATE_MUTATION, {
      discount: {
        title: (env.DISCOUNT_TITLE || 'Subscriber welcome') + ' — ' + code,
        code,
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
        usageLimit: 1,
        appliesOncePerCustomer: true,
        customerSelection: { all: true },
        customerGets: {
          value: { percentage },
          items: { all: true },
        },
      },
    });

    if (!result.ok) return { ok: false };

    const payload = result.data?.data?.discountCodeBasicCreate;
    const userErrors = payload?.userErrors || [];

    if (userErrors.length === 0 && payload?.codeDiscountNode?.id) {
      return { ok: true, code };
    }

    const duplicate = userErrors.some((e) => /taken|already exists|duplicate/i.test(e.message || ''));
    if (!duplicate) {
      console.error('discountCodeBasicCreate userErrors', JSON.stringify(userErrors));
      return { ok: false };
    }
  }

  console.error('discountCodeBasicCreate: exhausted retries on duplicate codes');
  return { ok: false };
}

async function shopifyGraphQL(env, query, variables) {
  const version = env.SHOPIFY_API_VERSION || '2026-07';
  const endpoint = `https://${env.SHOPIFY_SHOP}/admin/api/${version}/graphql.json`;

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': env.SHOPIFY_ADMIN_TOKEN,
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!res.ok) {
    console.error('shopify http error', res.status, await res.text());
    return { ok: false };
  }

  const data = await res.json();
  if (data.errors) {
    console.error('shopify graphql errors', JSON.stringify(data.errors));
    return { ok: false };
  }

  return { ok: true, data };
}

/* ── nightly cleanup ───────────────────────────────────────── */

// codeDiscountNodes is deprecated in favour of discountNodes. Still served in
// 2026-07, so left as is rather than migrated blind; revisit before the next
// version bump, since the replacement returns a different node shape.
const EXPIRED_QUERY = `
  query expiredCodes($cursor: String) {
    codeDiscountNodes(first: 50, after: $cursor, query: "status:expired") {
      pageInfo { hasNextPage endCursor }
      nodes {
        id
        codeDiscount {
          ... on DiscountCodeBasic { title endsAt }
        }
      }
    }
  }`;

const DELETE_MUTATION = `
  mutation deleteCode($id: ID!) {
    discountCodeDelete(id: $id) {
      deletedCodeDiscountId
      userErrors { field message }
    }
  }`;

/**
 * Subscriber codes accumulate one per claim, so sweep the expired
 * ones nightly. Only touches codes whose title carries our prefix —
 * hand-made codes in the admin are left alone.
 */
async function deleteExpiredCodes(env) {
  const prefix = env.CODE_PREFIX || 'FA-WELCOME-';
  let cursor = null;
  let deleted = 0;

  for (let page = 0; page < 20; page++) {
    const result = await shopifyGraphQL(env, EXPIRED_QUERY, { cursor });
    if (!result.ok) break;

    const connection = result.data?.data?.codeDiscountNodes;
    if (!connection) break;

    for (const node of connection.nodes || []) {
      const title = node.codeDiscount?.title || '';
      if (!title.includes(prefix)) continue;

      const del = await shopifyGraphQL(env, DELETE_MUTATION, { id: node.id });
      if (del.ok && !del.data?.data?.discountCodeDelete?.userErrors?.length) deleted++;
    }

    if (!connection.pageInfo?.hasNextPage) break;
    cursor = connection.pageInfo.endCursor;
  }

  console.log(`cleanup: deleted ${deleted} expired subscriber codes`);
}

/* ── beehiiv ───────────────────────────────────────────────── */

async function isBeehiivSubscriber(env, email) {
  const endpoint =
    `https://api.beehiiv.com/v2/publications/${env.BEEHIIV_PUBLICATION_ID}` +
    `/subscriptions/by_email/${encodeURIComponent(email)}`;

  const res = await fetch(endpoint, {
    headers: { Authorization: `Bearer ${env.BEEHIIV_API_KEY}`, Accept: 'application/json' },
  });

  if (res.status === 404) return false;
  if (!res.ok) {
    // Don't punish a subscriber for a beehiiv outage.
    console.error('beehiiv lookup failed', res.status);
    return true;
  }

  const data = await res.json();
  return (data?.data?.status || '').toLowerCase() === 'active';
}

/* ── helpers ───────────────────────────────────────────────── */

async function isRateLimited(env, ip) {
  const key = `rl:${ip}`;
  const count = Number((await env.CLAIMS.get(key)) || 0);
  if (count >= RATE_LIMIT_MAX) return true;
  await env.CLAIMS.put(key, String(count + 1), { expirationTtl: RATE_LIMIT_WINDOW });
  return false;
}

function normaliseEmail(value) {
  const email = String(value || '').trim().toLowerCase();
  if (email.length > 254) return null;
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) ? email : null;
}

function randomCode(length) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = '';
  for (const byte of bytes) out += CODE_ALPHABET[byte % CODE_ALPHABET.length];
  return out;
}

async function sha256Hex(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}

function json(body, status, origin) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...corsHeaders(origin) },
  });
}
