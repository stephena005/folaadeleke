#!/usr/bin/env node
// Compares what the site says about prints with what the Shopify store
// actually sells, so a price or stock change made in Shopify Admin is
// caught before a buyer finds the gap.
//
//   node scripts/check-shop.mjs          # report drift, exit 1 if any
//   node scripts/check-shop.mjs --fix    # also rewrite prices on the prints page
//
// Source of truth is the shop: shop.folaadeleke.com is where people pay.
// The site only quotes it. The shop's public storefront JSON needs no
// credentials (/products.json for the catalogue, /products/<handle>.js
// for availability), so this runs in CI with no secrets.
//
// Checks:
//   1. Every shop link on the site — the wall, the products pages, the
//      live email templates — points at a product that exists.
//   2. On the wall, each print's data-sizes and tomb price match the
//      shop's A1/A2/A3 variant prices (--fix rewrites these two).
//   3. Sold-out on the wall matches availability in the shop, both ways.
//      Reported, never fixed: a sold-out edition can be a deliberate
//      call even while Shopify shows stock.
//   4. The wallpaper pack's price on the products pages.
//   5. The retail column on the trade page (the trade column is a
//      proposal derived from it, so it is checked as 75% of retail).
//   6. Shop products the site never links — informational.
//
// Sent newsletters (newsletter-*.html) are not checked: they are history.
// welcome-email.html and coa-email.html are live templates, so they are.
//
// Run weekly by .github/workflows/shop-sync.yml, which opens or updates
// a GitHub issue when anything drifts.

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SHOP = 'https://shop.folaadeleke.com';
const fix = process.argv.includes('--fix');
const SIZES = ['A1', 'A2', 'A3'];

const problems = [];
const notes = [];
const fail = (file, msg) => problems.push(`${file}  ${msg}`);
const note = (msg) => notes.push(msg);

const money = (pence) => `£${(pence / 100).toFixed(2).replace(/\.00$/, '')}`;
const parseMoney = (s) => Math.round(parseFloat(String(s).replace(/[£,]/g, '')) * 100);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Shopify's storefront endpoints rate-limit bursts with 429; back off and
// retry, and give up with exit 2 ("could not read the shop", not "drift").
async function getJson(url, attempt = 1) {
  const res = await fetch(url, { headers: { accept: 'application/json' } });
  if (res.status === 404) return null;
  if (res.status === 429 || res.status >= 500) {
    if (attempt >= 5) { console.error(`check-shop: ${url} still answering ${res.status} after ${attempt} tries — try again later`); process.exit(2); }
    await sleep((Number(res.headers.get('retry-after')) || 2 ** attempt) * 1000);
    return getJson(url, attempt + 1);
  }
  if (!res.ok) throw new Error(`${url} → ${res.status}`);
  return res.json();
}

// A few requests at a time, not thirty at once.
async function mapLimit(items, limit, fn) {
  const out = []; let i = 0;
  await Promise.all(Array.from({ length: limit }, async () => { while (i < items.length) out.push(await fn(items[i++])); }));
  return out;
}

// ── the catalogue ────────────────────────────────────────────────────────
const products = new Map(); // handle -> { title, variants: {A1: pence, ...}, available, variantAvail }
for (let page = 1; ; page++) {
  const data = await getJson(`${SHOP}/products.json?limit=250&page=${page}`);
  const list = data?.products ?? [];
  for (const p of list) {
    const variants = {};
    for (const v of p.variants) variants[v.title] = parseMoney(v.price);
    products.set(p.handle, { title: p.title, variants, available: null });
  }
  if (list.length < 250) break;
}
if (products.size === 0) { console.error('check-shop: the shop returned no products — is shop.folaadeleke.com up?'); process.exit(2); }

// ── what the site links ──────────────────────────────────────────────────
const tracked = execFileSync('git', ['ls-files', '-z', '*.html'], { cwd: repoRoot, encoding: 'utf8' }).split('\0').filter(Boolean)
  .filter((f) => !/^(mockups|shopify-theme)\//.test(f) && !/^newsletter-.*\.html$/.test(f));
// Working tree first, index second: a tracked file deleted locally but not yet committed is still live.
const contents = (file) => existsSync(resolve(repoRoot, file)) ? readFileSync(resolve(repoRoot, file), 'utf8') : execFileSync('git', ['show', `:${file}`], { cwd: repoRoot, encoding: 'utf8' });
const linked = new Map(); // handle -> Set(files)
for (const file of tracked) {
  const text = contents(file);
  for (const m of text.matchAll(/shop\.folaadeleke\.com\/products\/([a-z0-9-]+)/g)) {
    if (!linked.has(m[1])) linked.set(m[1], new Set());
    linked.get(m[1]).add(file);
  }
}

// 1. every link resolves
for (const [handle, files] of linked) {
  if (!products.has(handle)) fail([...files].join(', '), `links to ${SHOP}/products/${handle}, which is not in the shop (404 for the buyer)`);
}

// availability for the handles the wall uses (one request each)
const prints = resolve(repoRoot, 'prints/index.html');
let wall = readFileSync(prints, 'utf8');
// One block per print; the attribute line is parsed on its own so an
// optional attribute (data-shop) cannot be skipped by a lazy match.
const BLOCK_RE = /^ {8}<a class="hang([^"]*)" href="#[^"]+" id="([^"]+)"\n([^\n]*)>\n[\s\S]*?^ {8}<\/a>\n/gm;
const attr = (line, name) => new RegExp(`\\b${name}="([^"]*)"`).exec(line)?.[1] ?? null;
const hangs = [...wall.matchAll(BLOCK_RE)].map((m) => ({
  classes: m[1], slug: m[2], attrs: m[3],
  title: attr(m[3], 'data-title'), sizes: attr(m[3], 'data-sizes'),
  handle: /\/products\/([a-z0-9-]+)/.exec(attr(m[3], 'data-shop') ?? '')?.[1] ?? null,
  tomb: /<div class="tomb"><b>[^<]*<\/b><span>([^<]*)<\/span>/.exec(m[0])?.[1] ?? '',
}));
await mapLimit(hangs, 4, async (h) => {
  const handle = h.handle ?? (products.has(h.slug) ? h.slug : null);
  if (!handle) return;
  const js = await getJson(`${SHOP}/products/${handle}.js`).catch(() => null);
  if (js && products.has(handle)) products.get(handle).available = js.available;
});

// 2 + 3. the wall
let fixed = 0;
for (const h of hangs) {
  const soldOutOnSite = /\bsold-out\b/.test(h.classes) || !h.handle;
  const handle = h.handle ?? (products.has(h.slug) ? h.slug : null);
  const p = handle ? products.get(handle) : null;
  if (!p) {
    if (h.handle) continue; // already reported under 1
    continue; // sold out with no product anywhere: nothing to compare
  }
  const shopSizes = SIZES.filter((s) => s in p.variants);
  if (h.handle) {
    const want = shopSizes.map((s) => `${s} — ${money(p.variants[s])}`).join(' / ');
    const wantTomb = `Edition of 15 · A1 — ${money(p.variants.A1 ?? 0)}`;
    if (h.sizes !== want) {
      fail('prints/index.html', `${h.title}: data-sizes says "${h.sizes}" but the shop sells ${want}`);
      if (fix) { wall = wall.replace(h.attrs, h.attrs.replace(`data-sizes="${h.sizes}"`, `data-sizes="${want}"`)); fixed++; }
    }
    if ('A1' in p.variants && h.tomb !== wantTomb && h.tomb.startsWith('Edition of 15')) {
      fail('prints/index.html', `${h.title}: tomb says "${h.tomb}" but A1 is ${money(p.variants.A1)}`);
      if (fix) { wall = wall.replace(`<b>${h.title.replace(/&/g, '&amp;')}</b><span>${h.tomb}</span>`, `<b>${h.title.replace(/&/g, '&amp;')}</b><span>${wantTomb}</span>`); fixed++; }
    }
  }
  if (p.available === true && soldOutOnSite) fail('prints/index.html', `${h.title} is marked sold out on the wall but ${SHOP}/products/${handle} is available — sold out for real, or drift?`);
  if (p.available === false && !soldOutOnSite) fail('prints/index.html', `${h.title} is for sale on the wall but ${SHOP}/products/${handle} shows no stock — mark it sold out or restock`);
}
if (fix && fixed) { writeFileSync(prints, wall); console.log(`check-shop: rewrote ${fixed} price string${fixed === 1 ? '' : 's'} in prints/index.html — review the diff and commit`); }

// 4. wallpaper pack
const pack = products.get('propeller-wallpaper-pack');
if (pack) {
  const price = Object.values(pack.variants)[0];
  for (const file of ['products/index.html', 'products/propeller-wallpaper-pack/index.html']) {
    const text = readFileSync(resolve(repoRoot, file), 'utf8');
    const m = /class="(?:card|product)-price">(?:&#163;|£)([\d.]+)</.exec(text);
    if (m && parseMoney(m[1]) !== price) fail(file, `shows £${m[1]} but the shop sells the wallpaper pack at ${money(price)}`);
  }
}

// 5. trade page retail column
const tradeFile = 'trade/cd95f790da1e/index.html';
const trade = readFileSync(resolve(repoRoot, tradeFile), 'utf8');
const ref = products.get('sisterhood') ?? [...products.values()].find((p) => 'A1' in p.variants);
if (ref) {
  for (const s of SIZES) {
    const row = new RegExp(`<td>${s}</td><td class="num">[^<]*</td><td class="num">£([\\d.]+)</td><td class="num">£([\\d.]+)</td>`).exec(trade);
    if (!row) continue;
    const retail = ref.variants[s];
    if (parseMoney(row[1]) !== retail) fail(tradeFile, `${s} retail column says £${row[1]} but the shop sells ${s} at ${money(retail)}`);
    if (parseMoney(row[2]) !== Math.round(retail * 0.75)) fail(tradeFile, `${s} trade column says £${row[2]}, which is not 75% of the shop's ${money(retail)}`);
  }
}

// 6. products nobody links
for (const handle of products.keys()) {
  if (!linked.has(handle)) note(`${SHOP}/products/${handle} ("${products.get(handle).title}") is in the shop but nothing on the site links to it`);
}

// ── report ───────────────────────────────────────────────────────────────
for (const n of notes) console.log(`note   ${n}`);
if (problems.length) {
  for (const p of problems) console.error(p);
  console.error(`\n${problems.length} difference${problems.length === 1 ? '' : 's'} between the site and the shop.`);
  process.exit(1);
}
console.log(`check-shop: ${products.size} products, ${hangs.length} hangs on the wall, ${linked.size} handles linked — site and shop agree.`);
