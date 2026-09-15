#!/usr/bin/env node
// Guardrails for a public repo whose root IS the live site.
//
//   node scripts/check-site.mjs          # check what git would commit
//   npm run check                        # same
//
// Runs from the pre-commit hook (.githooks/pre-commit) and from CI
// (.github/workflows/guardrails.yml). Exit 1 with a list of problems, or
// exit 0 with a one-line summary.
//
// Everything `git ls-files` returns is readable at folaadeleke.com/<path>
// the moment it reaches main — GitHub Pages builds from the branch with no
// gate in between. So the file SET checked here is the index, not the
// working tree: an untracked image that a page links to is a 404 live,
// and a tracked file nobody meant to publish is public. Both have already
// happened once (back-office/ served for three months; the Guess artwork
// pointed at an untracked 54MB master).
//
// Checks, in order:
//   1. Private paths — back-office/, rendered emails, env files, buyer lists.
//   2. Unknown top-level directory — every new one is a new public URL, so
//      it must be added to PUBLIC_DIRS below on purpose.
//   3. Secrets — Shopify/GitHub/AWS token shapes, private keys, and a claim
//      link that carries a real secret instead of the placeholder.
//   4. Oversize files — GitHub refuses >100MB and warns at 50MB.
//   5. Dead links — every root-relative or folaadeleke.com href/src/srcset
//      in tracked HTML, plus image paths in string literals, must resolve
//      to a tracked file. Sitemap <loc>s too.
//   6. Drops — a puzzle page whose CAMPAIGN_END has passed must not still
//      carry its DISCOUNT_CODE (run scripts/close-drop.mjs), and the home
//      banner's timer must agree with the page it links to.
//   7. Sitemap dates — every <lastmod> must match git (scripts/update-sitemap.mjs);
//      skipped on a shallow clone, where git has no history to compare.

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, posix, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { computeSitemap } from './update-sitemap.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SITE_HOST = 'folaadeleke.com';

// Every directory here is a public URL prefix. Adding a directory to the
// repo means adding it here first, which is the moment to ask whether it
// should be readable at folaadeleke.com/<dir>/.
const PUBLIC_DIRS = new Set([
  '.github', '.githooks',
  'artist', 'claim', 'concepts', 'contact', 'enquiry', 'find', 'guess',
  'images', 'internship', 'interview', 'js', 'mockups', 'press', 'prints',
  'privacy', 'products', 'rearrange', 'scripts', 'shopify-theme', 'terms',
  'trade', 'verify', 'worker',
]);

const PRIVATE_PATHS = [
  [/^back-office\//, 'back-office/ is buyer certificates, invoices and agreements — never tracked'],
  [/\.rendered\.html$/, 'rendered emails carry the live CLAIM_SECRET'],
  [/(^|\/)\.env(\.|$)/, 'environment files hold API tokens'],
  [/(^|\/)Buyers\.csv$/i, 'the buyer list is personal data'],
  [/verify-tokens\.json$/, 'the token list maps certificates to buyers'],
  [/^trade\/lookbook-src\//, 'trade sources are gitignored; only the published page is tracked'],
];

// Top-level files that look like back-office spillover.
const PRIVATE_ROOT_FILE = /\.(csv|docx|xlsx|xlsm|numbers|pages|key|pem|p12)$/i;

const SECRET_PATTERNS = [
  [/shp(at|ss|ca|pa)_[A-Fa-f0-9]{32}/, 'Shopify access token'],
  [/gh[pousr]_[A-Za-z0-9]{36,}/, 'GitHub token'],
  [/AKIA[0-9A-Z]{16}/, 'AWS access key'],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, 'private key'],
  [/[?&]c=[0-9a-f]{32,}/, 'claim link with a real secret (use REPLACE_WITH_CLAIM_SECRET)'],
];

const MAX_FILE_BYTES = 25 * 1024 * 1024;
const TEXT_EXT = /\.(html|htm|js|mjs|cjs|json|md|txt|css|toml|ya?ml|xml|svg|liquid)$/i;
const ASSET_EXT = /\.(jpe?g|png|webp|gif|svg|avif|mp4|webm|mp3|m4a|pdf|css|js|json|woff2?)$/i;

const problems = [];
const fail = (file, msg, line) => problems.push({ file, msg, line });

function git(...args) {
  return execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8', maxBuffer: 64 << 20 });
}

// The index is what the commit will contain, so it is what the site will be.
const tracked = git('ls-files', '-z').split('\0').filter(Boolean);
const trackedSet = new Set(tracked);

function contents(path) {
  const abs = resolve(repoRoot, path);
  if (existsSync(abs)) return readFileSync(abs, 'utf8');
  try { return git('show', `:${path}`); } catch { return ''; }
}

function sizeOf(path) {
  const abs = resolve(repoRoot, path);
  if (existsSync(abs)) return statSync(abs).size;
  try { return Number(git('cat-file', '-s', `:${path}`).trim()); } catch { return 0; }
}

function lineOf(text, index) {
  let n = 1;
  for (let i = 0; i < index && i < text.length; i++) if (text.charCodeAt(i) === 10) n++;
  return n;
}

// ── 1 + 2 + 4: paths and sizes ───────────────────────────────────────────
for (const path of tracked) {
  for (const [re, why] of PRIVATE_PATHS) {
    if (re.test(path)) fail(path, `private path tracked — ${why}`);
  }
  const top = path.split('/')[0];
  if (path.includes('/')) {
    if (!PUBLIC_DIRS.has(top)) {
      fail(path, `new top-level directory "${top}/" would be public at https://${SITE_HOST}/${top}/ — add it to PUBLIC_DIRS in scripts/check-site.mjs if that is intended`);
    }
  } else if (PRIVATE_ROOT_FILE.test(path)) {
    fail(path, 'root-level document/spreadsheet would be public — is this back-office material?');
  }
  const size = sizeOf(path);
  if (size > MAX_FILE_BYTES) {
    fail(path, `${(size / 1048576).toFixed(1)}MB tracked file — export a web-sized copy, never a print master`);
  }
}

// ── 3: secrets ───────────────────────────────────────────────────────────
for (const path of tracked) {
  if (!TEXT_EXT.test(path)) continue;
  const text = contents(path);
  for (const [re, what] of SECRET_PATTERNS) {
    const m = re.exec(text);
    if (m) fail(path, `looks like a ${what}`, lineOf(text, m.index));
  }
}
if (trackedSet.has('welcome-email.html') && !contents('welcome-email.html').includes('REPLACE_WITH_CLAIM_SECRET')) {
  fail('welcome-email.html', 'the tracked template must keep the REPLACE_WITH_CLAIM_SECRET placeholder; only welcome-email.rendered.html (gitignored) carries the secret');
}

// ── 5: links ─────────────────────────────────────────────────────────────
// A URL path resolves the way GitHub Pages resolves it: the file itself,
// dir/index.html, or path.html for an extensionless path.
function resolves(urlPath) {
  let p = urlPath.replace(/^\/+/, '');
  try { p = decodeURIComponent(p); } catch { /* leave as-is */ }
  p = posix.normalize(p);
  if (p === '.' || p === '') return true;
  if (trackedSet.has(p)) return true;
  if (trackedSet.has(posix.join(p, 'index.html'))) return true;
  if (!posix.extname(p) && trackedSet.has(`${p}.html`)) return true;
  return false;
}

// Turn an href into a site path, or null when it is not ours to check.
function sitePath(raw, fromFile) {
  let url = raw.trim().replace(/&amp;/g, '&');
  if (!url) return null;
  // Template placeholders ([HERO LINK], YOUR_WEBSITE_URL, {{unsubscribe_url}})
  // and JS-built strings ('/prints/' + p.img, `${thumb}`) are not links yet.
  if (/[\[\]{}'"+$()\s]/.test(url) || /YOUR_|REPLACE_WITH/.test(url)) return null;
  if (/^(#|mailto:|tel:|sms:|javascript:|data:|blob:)/i.test(url)) return null;
  const abs = /^https?:\/\/([^/?#]+)([^?#]*)/i.exec(url);
  if (abs) {
    if (abs[1].toLowerCase() !== SITE_HOST && abs[1].toLowerCase() !== `www.${SITE_HOST}`) return null;
    url = abs[2] || '/';
  } else if (/^[a-z][a-z0-9+.-]*:/i.test(url) || url.startsWith('//')) {
    return null; // some other scheme, or protocol-relative to another host
  }
  url = url.split(/[?#]/)[0];
  if (!url) return null;
  if (url.startsWith('/')) return url;
  return '/' + posix.join(posix.dirname(fromFile), url); // relative to the page
}

const ATTR_RE = /\b(?:href|src|poster|data-src)\s*=\s*(?:"([^"]*)"|'([^']*)')/gi;
const SRCSET_RE = /\bsrcset\s*=\s*(?:"([^"]*)"|'([^']*)')/gi;
const META_RE = /<meta[^>]+content\s*=\s*"(https?:\/\/[^"]+)"/gi;
const CSS_URL_RE = /(?<![\w.-])url\(\s*['"]?([^'")]+)['"]?\s*\)/g; // CSS url(), not readAsDataURL()
// A quoted string that is plainly a site asset path: '/images/guess/artwork.jpg'
const LITERAL_RE = /['"](\/(?:images|js)\/[^'"\s]+)['"]/g;

function checkLinks(path) {
  const text = contents(path);
  const seen = new Set();
  const check = (raw, index) => {
    const p = sitePath(raw, path);
    if (!p) return;
    const key = p;
    if (seen.has(key)) return;
    seen.add(key);
    if (!resolves(p)) fail(path, `links to ${p}, which is not a tracked file (404 once deployed)`, lineOf(text, index));
  };
  let m;
  for (const re of [ATTR_RE, META_RE, CSS_URL_RE]) {
    re.lastIndex = 0;
    while ((m = re.exec(text))) check(m[1] ?? m[2], m.index);
  }
  SRCSET_RE.lastIndex = 0;
  while ((m = SRCSET_RE.exec(text))) {
    for (const cand of (m[1] ?? m[2]).split(',')) check(cand.trim().split(/\s+/)[0], m.index);
  }
  LITERAL_RE.lastIndex = 0;
  while ((m = LITERAL_RE.exec(text))) if (ASSET_EXT.test(m[1])) check(m[1], m.index);
}

for (const path of tracked) {
  if (!/\.(html|js)$/i.test(path)) continue;
  if (/^(shopify-theme|worker|scripts|\.github)\//.test(path)) continue; // other hosts / not pages
  if (/^mockups\//.test(path)) continue; // design comparisons, not navigable pages
  checkLinks(path);
}

if (trackedSet.has('sitemap.xml')) {
  const xml = contents('sitemap.xml');
  let m;
  const re = /<loc>\s*([^<\s]+)\s*<\/loc>/g;
  while ((m = re.exec(xml))) {
    const p = sitePath(m[1], 'sitemap.xml');
    if (p && !resolves(p)) fail('sitemap.xml', `lists ${p}, which is not a tracked file`, lineOf(xml, m.index));
  }
}

// ── 6: drops ─────────────────────────────────────────────────────────────
const now = Date.now();
const drops = new Map(); // "/find" -> { end, code }
for (const path of tracked) {
  const m = /^([^/]+)\/index\.html$/.exec(path);
  if (!m) continue;
  const text = contents(path);
  const end = /var\s+CAMPAIGN_END\s*=\s*'([^']+)'/.exec(text);
  const code = /var\s+DISCOUNT_CODE\s*=\s*'([^']+)'/.exec(text);
  if (!end || !code) continue;
  const endMs = Date.parse(end[1]);
  drops.set(`/${m[1]}`, { end: end[1], endMs, code: code[1] });
  if (Number.isNaN(endMs)) fail(path, `CAMPAIGN_END "${end[1]}" is not a parseable date`, lineOf(text, end.index));
  else if (endMs <= now) {
    fail(path, `drop ended ${end[1]} but ${code[1]} is still in the source — run: node scripts/close-drop.mjs`, lineOf(text, code.index));
  }
}

if (trackedSet.has('index.html')) {
  const home = contents('index.html');
  const banner = /<a[^>]+class="puzzle-banner"[^>]+href="([^"]+)"/.exec(home);
  const bStart = /var\s+BANNER_START\s*=\s*new Date\('([^']+)'\)/.exec(home);
  const bEnd = /var\s+BANNER_END\s*=\s*new Date\('([^']+)'\)/.exec(home);
  if (banner && bStart && bEnd) {
    const target = banner[1].split(/[?#]/)[0].replace(/\/$/, '');
    const drop = drops.get(target);
    const endMs = Date.parse(bEnd[1]);
    if (drop) {
      if (drop.end !== bEnd[1]) fail('index.html', `BANNER_END is ${bEnd[1]} but CAMPAIGN_END in ${target}/index.html is ${drop.end} — they must match`, lineOf(home, bEnd.index));
      if (Date.parse(bStart[1]) >= drop.endMs) fail('index.html', 'BANNER_START is not before the drop ends', lineOf(home, bStart.index));
    } else if (endMs > now) {
      fail('index.html', `banner links to ${target}, which is not a live drop, yet BANNER_END ${bEnd[1]} is in the future — visitors would be sent to a closed page`, lineOf(home, banner.index));
    }
  }
}

// ── 7: sitemap dates ─────────────────────────────────────────────────────
if (trackedSet.has('sitemap.xml') && git('rev-parse', '--is-shallow-repository').trim() !== 'true') {
  const { changes } = computeSitemap(contents('sitemap.xml'));
  for (const c of changes) fail('sitemap.xml', `lastmod for ${c.loc} is ${c.from} but git says ${c.to} — run: node scripts/update-sitemap.mjs (the pre-commit hook does this)`);
}

// ── report ───────────────────────────────────────────────────────────────
if (problems.length) {
  problems.sort((a, b) => a.file.localeCompare(b.file) || (a.line ?? 0) - (b.line ?? 0));
  for (const p of problems) console.error(`${p.file}${p.line ? `:${p.line}` : ''}  ${p.msg}`);
  console.error(`\n${problems.length} problem${problems.length === 1 ? '' : 's'}. Nothing was committed.`);
  process.exit(1);
}
console.log(`check-site: ${tracked.length} tracked files, ${drops.size} live drop${drops.size === 1 ? '' : 's'}, no problems.`);
