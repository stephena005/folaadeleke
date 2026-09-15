#!/usr/bin/env node
// Checks the live estate: not the repo, the things a visitor actually
// hits. Run daily by .github/workflows/live-check.yml, which opens a
// GitHub issue when anything fails.
//
//   node scripts/check-live.mjs
//
// What is checked:
//   1. folaadeleke.com — every sitemap page, the unlisted pages that are
//      linked from emails (claim, trade, the current drop), all 35-odd
//      verify pages the printed QR codes point at, and every image the
//      home page loads. All must be 200; a random path must be 404.
//   2. The claim Worker — /health answers, the nightly code sweep has
//      run in the last 36 hours (from the lastSweep it reports), a claim
//      with a wrong secret is refused with 403 (proves the claim path and
//      its KV binding are alive, without minting anything), and CORS
//      still allows folaadeleke.com.
//   3. shop.folaadeleke.com — the storefront answers and lists products.
//      (scripts/check-shop.mjs does the detailed comparison weekly.)
//
// Not checked: beehiiv's subscribe form and embed script answer 403 to
// anything that is not a browser, so probing them would only cry wolf.
// The Shopify discount code for a live drop cannot be verified without
// Admin API access — that stays a manual step, as the drop kit says.

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SITE = 'https://folaadeleke.com';
const SHOP = 'https://shop.folaadeleke.com';
const WORKER = 'https://fa-subscriber-discount.adegasoye.workers.dev';
const SWEEP_MAX_AGE_H = 36; // the cron is nightly; 36h allows one late run
const UA = 'folaadeleke-live-check/1 (+https://github.com/stephena005/folaadeleke)';

const problems = [];
const fail = (what, msg) => problems.push(`${what}  ${msg}`);
const git = (...a) => execFileSync('git', a, { cwd: repoRoot, encoding: 'utf8' });

async function probe(url, { method = 'GET', headers = {}, body, redirect = 'follow' } = {}) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 20000);
  try {
    const res = await fetch(url, { method, headers: { 'user-agent': UA, ...headers }, body, redirect, signal: ctl.signal });
    return { status: res.status, headers: res.headers, text: await res.text() };
  } catch (e) {
    return { status: 0, error: e.name === 'AbortError' ? 'timed out after 20s' : e.message };
  } finally { clearTimeout(t); }
}

async function mapLimit(items, limit, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: limit }, async () => { while (i < items.length) await fn(items[i++]); }));
}

async function expect200(url) {
  const r = await probe(url, { method: 'HEAD' });
  if (r.status !== 200) fail(url, r.status ? `answered ${r.status}` : r.error);
}

// ── 1. the site ──────────────────────────────────────────────────────────
const pages = new Set([`${SITE}/`, `${SITE}/claim/`]);
for (const m of readFileSync(resolve(repoRoot, 'sitemap.xml'), 'utf8').matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)) pages.add(m[1]);
for (const dir of git('ls-files', 'trade/*/index.html').trim().split('\n').filter(Boolean)) pages.add(`${SITE}/${dir.replace(/index\.html$/, '')}`);
for (const dir of git('ls-files', 'verify/*/index.html').trim().split('\n').filter(Boolean)) pages.add(`${SITE}/${dir.replace(/index\.html$/, '')}`);

const home = readFileSync(resolve(repoRoot, 'index.html'), 'utf8');
const banner = /<a[^>]+class="puzzle-banner"[^>]+href="([^"]+)"/.exec(home);
const bEnd = /var\s+BANNER_END\s*=\s*new Date\('([^']+)'\)/.exec(home);
if (banner && bEnd && Date.parse(bEnd[1]) > Date.now()) pages.add(`${SITE}${banner[1]}`); // a drop that is live or imminent

const assets = new Set();
for (const m of home.matchAll(/\b(?:src|href)="(\/images\/[^"]+|\/js\/[^"]+|\/favicon[^"]*|\/manifest\.json)"/g)) assets.add(`${SITE}${m[1]}`);

await mapLimit([...pages, ...assets], 6, expect200);

{
  const r = await probe(`${SITE}/this-page-does-not-exist-${Date.now()}`);
  if (r.status !== 404) fail(`${SITE}/<missing>`, `a missing page answered ${r.status || r.error}, not 404 — is the custom 404 broken?`);
}

// ── 2. the claim worker ──────────────────────────────────────────────────
{
  const h = await probe(`${WORKER}/health`);
  let body = null;
  try { body = JSON.parse(h.text); } catch { /* not json */ }
  if (h.status !== 200 || !body?.ok) fail(`${WORKER}/health`, h.status ? `answered ${h.status}: ${h.text.slice(0, 120)}` : h.error);
  else if (!body.lastSweep) fail(`${WORKER}/health`, 'reports no lastSweep — either the Worker has not been redeployed with the sweep stamp, or the nightly cron has never run since it was');
  else {
    const ageH = (Date.now() - Date.parse(body.lastSweep.at)) / 36e5;
    if (!(ageH < SWEEP_MAX_AGE_H)) fail(`${WORKER}/health`, `the nightly code sweep last ran ${body.lastSweep.at} (${ageH.toFixed(0)}h ago) — the cron trigger may be broken`);
  }

  const c = await probe(`${WORKER}/claim`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: SITE },
    body: JSON.stringify({ email: 'live-check@example.com', c: 'not-the-secret' }),
  });
  let cb = null;
  try { cb = JSON.parse(c.text); } catch { /* not json */ }
  if (c.status !== 403 || cb?.status !== 'invalid_link') fail(`${WORKER}/claim`, `a claim with a wrong secret should be refused with 403 invalid_link, got ${c.status || c.error} ${c.text?.slice(0, 120) ?? ''}`);
  if (c.headers && c.headers.get('access-control-allow-origin') !== SITE) fail(`${WORKER}/claim`, `Access-Control-Allow-Origin is "${c.headers?.get('access-control-allow-origin')}", so the claim page on ${SITE} cannot call it`);
}

// ── 3. the shop ──────────────────────────────────────────────────────────
{
  const r = await probe(`${SHOP}/products.json?limit=1`, { headers: { accept: 'application/json' } });
  let n = -1;
  try { n = JSON.parse(r.text).products.length; } catch { /* not json */ }
  if (r.status === 429) console.log(`note   ${SHOP} rate-limited this probe; not counted as a failure`);
  else if (r.status !== 200 || n < 1) fail(SHOP, r.status ? `products.json answered ${r.status} with ${n} products` : r.error);
}

// ── report ───────────────────────────────────────────────────────────────
if (problems.length) {
  for (const p of problems) console.error(p);
  console.error(`\n${problems.length} problem${problems.length === 1 ? '' : 's'} on the live estate.`);
  process.exit(1);
}
console.log(`check-live: ${pages.size} pages, ${assets.size} home-page assets, the claim Worker and the shop all answer as expected.`);
