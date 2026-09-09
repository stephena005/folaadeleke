// Stubs KV and the Shopify API so the claim logic can be exercised
// without a deploy. Run with `npm test` (no dependencies, Node 18+).
import worker from '../src/index.js';

const store = new Map();
const KV = {
  async get(k) { const v = store.get(k); return v === undefined ? null : v; },
  async put(k, v) { store.set(k, v); },
};

let created = [];
let deleted = [];
globalThis.fetch = async (url, init) => {
  const body = JSON.parse(init.body);
  if (body.query.includes('discountCodeBasicCreate')) {
    created.push(body.variables.discount);
    return new Response(JSON.stringify({ data: { discountCodeBasicCreate: { codeDiscountNode: { id: 'gid://x/1' }, userErrors: [] } } }), { status: 200 });
  }
  if (body.query.includes('codeDiscountNodes')) {
    return new Response(JSON.stringify({ data: { codeDiscountNodes: { pageInfo: { hasNextPage: false }, nodes: [
      { id: 'gid://x/1', codeDiscount: { title: 'Subscriber welcome — FA-WELCOME-AAA', endsAt: '2020-01-01' } },
      { id: 'gid://x/2', codeDiscount: { title: 'PUZZLE0926', endsAt: '2020-01-01' } },
    ] } } }), { status: 200 });
  }
  if (body.query.includes('discountCodeDelete')) {
    deleted.push(body.variables.id);
    return new Response(JSON.stringify({ data: { discountCodeDelete: { deletedCodeDiscountId: body.variables.id, userErrors: [] } } }), { status: 200 });
  }
  throw new Error('unexpected query');
};

const env = { CLAIMS: KV, CLAIM_SECRET: 's3cret', SHOPIFY_SHOP: 'x.myshopify.com', SHOPIFY_ADMIN_TOKEN: 't', DISCOUNT_HOURS: '24' };
const claim = (body, ip='1.1.1.1') => worker.fetch(new Request('https://w/claim', {
  method: 'POST', headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': ip }, body: JSON.stringify(body),
}), env, { waitUntil() {} });

const j = async (r) => [r.status, await r.json()];
let fail = 0;
const check = (name, cond, extra='') => { console.log((cond ? 'PASS  ' : 'FAIL  ') + name + (cond ? '' : '  ' + extra)); if (!cond) fail++; };

// 1. first claim
let [s, d] = await j(await claim({ email: 'A@Example.com ', c: 's3cret' }));
check('first claim returns ok', s === 200 && d.status === 'ok' && /^FA-WELCOME-[A-Z2-9]{8}$/.test(d.code), JSON.stringify(d));
const firstCode = d.code;
const hours = (Date.parse(d.expiresAt) - Date.now()) / 3600000;
check('window is ~24h', hours > 23.9 && hours < 24.1, String(hours));
check('usageLimit 1 + percentage sent', created[0].usageLimit === 1 && created[0].customerGets.value.percentage === 0.1, JSON.stringify(created[0]));

// 2. re-click, case/whitespace normalised
[s, d] = await j(await claim({ email: 'a@example.com', c: 's3cret' }));
check('re-click returns same code', d.status === 'existing' && d.code === firstCode, JSON.stringify(d));
check('no second shopify code created', created.length === 1, String(created.length));

// 3. wrong secret
[s, d] = await j(await claim({ email: 'b@example.com', c: 'wrong' }));
check('bad secret rejected', s === 403 && d.status === 'invalid_link');

// 4. bad email
[s, d] = await j(await claim({ email: 'not-an-email', c: 's3cret' }));
check('bad email rejected', s === 400 && d.status === 'invalid_email');

// 5. expired entry
store.set('claim:' + await sha('old@example.com'), JSON.stringify({ code: 'FA-WELCOME-OLD', expiresAt: '2020-01-01T00:00:00.000Z' }));
[s, d] = await j(await claim({ email: 'old@example.com', c: 's3cret' }));
check('expired claim not re-issued', d.status === 'expired' && created.length === 1, JSON.stringify(d));

// 6. rate limit
let limited = false;
for (let i = 0; i < 12; i++) {
  const [st, dd] = await j(await claim({ email: `rl${i}@example.com`, c: 's3cret' }, '9.9.9.9'));
  if (dd.status === 'rate_limited') { limited = true; break; }
}
check('rate limit trips', limited);

// 7. cleanup only touches prefixed codes
await worker.scheduled({}, env, { waitUntil: (p) => p });
await new Promise(r => setTimeout(r, 50));
check('cleanup deletes only FA-WELCOME codes', deleted.length === 1 && deleted[0] === 'gid://x/1', JSON.stringify(deleted));

// 8. routing
check('health ok', (await worker.fetch(new Request('https://w/health'), env, {})).status === 200);
check('unknown path 404', (await worker.fetch(new Request('https://w/nope'), env, {})).status === 404);
const pre = await worker.fetch(new Request('https://w/claim', { method: 'OPTIONS' }), env, {});
check('CORS preflight', pre.status === 204 && pre.headers.get('Access-Control-Allow-Origin') === 'https://folaadeleke.com');

async function sha(v) {
  const dg = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(v));
  return [...new Uint8Array(dg)].map(b => b.toString(16).padStart(2,'0')).join('');
}
console.log(fail === 0 ? '\nALL PASS' : `\n${fail} FAILED`);
process.exit(fail ? 1 : 0);
