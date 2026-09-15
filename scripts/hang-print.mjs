#!/usr/bin/env node
// Hangs a new print at the Entrance of the gallery wall and does every
// edit that goes with it — the routine design.md §10 describes and the
// Papa's Girl / Crown She Carries commits did by hand.
//
//   node scripts/hang-print.mjs \
//     --title "Papa's Girl" \
//     --source "images/prints/Papa’s Girl/Papa's Girl.jpg" \
//     --shop papa-s-girl \
//     --pair girl-dad \
//     --moves-to family \
//     --caption-file caption.txt
//
//   --title       Display title. Apostrophes inside words become typographic (Papa’s).
//   --source      The master to export from (the .jpg, never the .tif/.png).
//   --shop        Shopify product handle, or the full shop URL. --sold-out
//                 omits data-shop, which the page renders as sold out.
//   --pair        Slug of the work it "hangs well with". Must already hang.
//   --moves-to    Room the OUTGOING Entrance work moves into: her, love,
//                 family, function or heritage. Required while the
//                 Entrance is occupied, because the newest work takes it.
//   --caption / --caption-file   The hidden caption shown in the detail view.
//   --slug        Override the slug derived from the title.
//   --number      Plate number; defaults to the next after the highest.
//   --edition     Default "Edition of 15".      --sizes  Default A1/A2/A3 prices.
//   --dry-run     Export to a temp file and describe the edits; write nothing.
//
// What it does, in order:
//   1. Exports images/prints/web/<slug>.jpg (1400px long edge, q74) via
//      scripts/export-print-web.py and reads its dimensions.
//   2. prints/index.html — new .hang block at the Entrance; the previous
//      Entrance work moves to the end of its room with the next salon
//      nudge and lazy loading; room counts, "No. N", the floor-plan total
//      and the three data-new flags are all updated.
//   3. index.html — the featured strip leads with the new print, keeps
//      four, and the fade-up delays are re-sequenced.
//   4. design.md — the "at the time of writing" line.
//   5. sitemap.xml — lastmod for / and /prints.
//   6. Stages everything it wrote, runs scripts/check-site.mjs, and HEAD-
//      checks the shop URL (a warning, not a failure — the product may not
//      be published yet).
// It does not commit. It does not touch the newsletter.

import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '..');
const PRINTS = resolve(repoRoot, 'prints/index.html');
const HOME = resolve(repoRoot, 'index.html');
const DESIGN = resolve(repoRoot, 'design.md');
const SITEMAP = resolve(repoRoot, 'sitemap.xml');
const WEB_DIR = 'images/prints/web';
const SHOP = 'https://shop.folaadeleke.com/products/';
const ROOMS = { her: 'her', love: 'love', family: 'family', function: 'function', 'the function': 'function', heritage: 'heritage' };

// ── args ─────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const opts = {};
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (!a.startsWith('--')) die(`unexpected argument ${a}`);
  const key = a.slice(2);
  if (['dry-run', 'sold-out'].includes(key)) { opts[key] = true; continue; }
  if (i + 1 >= argv.length) die(`--${key} needs a value`);
  opts[key] = argv[++i];
}
function die(msg) { console.error(`hang-print: ${msg}`); process.exit(1); }

const dryRun = !!opts['dry-run'];
const titleRaw = opts.title ?? die('--title is required');
const curly = (s) => s.replace(/(?<=\p{L})'(?=\p{L})/gu, '’'); // Papa's → Papa’s, but leave 'quoted' words alone
const title = curly(titleRaw).trim();
const source = resolve(repoRoot, opts.source ?? die('--source is required'));
if (!existsSync(source)) die(`source not found: ${source}`);
if (/\.(tiff?|png)$/i.test(source)) die('export from the .jpg master — the .tif/.png versions are up to 2GB');
let caption = opts.caption ?? (opts['caption-file'] ? readFileSync(resolve(repoRoot, opts['caption-file']), 'utf8') : null);
if (!caption) die('--caption or --caption-file is required (the detail view shows it)');
caption = curly(caption.replace(/\s+/g, ' ')).trim();
if (!opts.shop && !opts['sold-out']) die('--shop <handle> is required, or --sold-out');
const shopUrl = opts['sold-out'] ? null : (/^https?:/.test(opts.shop) ? opts.shop : SHOP + opts.shop.replace(/^\/+|\/+$/g, ''));
const pair = opts.pair ?? null;
const edition = opts.edition ?? 'Edition of 15';
const sizes = opts.sizes ?? 'A1 — £300 / A2 — £250 / A3 — £200';
const slug = opts.slug ?? slugify(title);
const today = new Date().toISOString().slice(0, 10);

function slugify(s) {
  return s.toLowerCase().replace(/[’'`]/g, '').replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}
const escAttr = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
const escText = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

// ── read the wall ────────────────────────────────────────────────────────
let prints = readFileSync(PRINTS, 'utf8');
const hangIds = [...prints.matchAll(/<a class="hang[^"]*" href="#[^"]+" id="([^"]+)"/g)].map((m) => m[1]);
const plateNumbers = [...prints.matchAll(/data-n="(\d+)"/g)].map((m) => Number(m[1]));
if (hangIds.includes(slug)) die(`a print with the slug "${slug}" already hangs — pass --slug to choose another`);
if (pair && !hangIds.includes(pair)) die(`--pair "${pair}" is not a hanging print. Slugs: ${hangIds.join(', ')}`);
const number = opts.number ? Number(opts.number) : Math.max(...plateNumbers) + 1;
if (plateNumbers.includes(number)) die(`plate number ${number} is already used`);

function section(html, dataRoom) {
  const start = html.indexOf(`<section class="room" id="room-${dataRoom}"`);
  if (start === -1) die(`no room "${dataRoom}" in prints/index.html`);
  const end = html.indexOf('</section>', start) + '</section>'.length;
  return { start, end, html: html.slice(start, end) };
}
const HANG_RE = /^ {8}<a class="hang[^"]*" href="#[^"]+" id="[^"]+"\n[\s\S]*?^ {8}<\/a>\n/gm;

const entrance = section(prints, 'entrance');
const outgoing = entrance.html.match(HANG_RE)?.[0] ?? null;
let moveTo = null;
if (outgoing) {
  const want = (opts['moves-to'] ?? '').toLowerCase().trim();
  if (!want) die('the Entrance is occupied — pass --moves-to <her|love|family|function|heritage> for the work moving out');
  moveTo = ROOMS[want] ?? die(`--moves-to "${want}" is not a room (her, love, family, function, heritage)`);
}

// ── 1. export ────────────────────────────────────────────────────────────
const webRel = `${WEB_DIR}/${slug}.jpg`;
const webAbs = resolve(repoRoot, webRel);
if (existsSync(webAbs) && !dryRun) die(`${webRel} already exists — remove it first if it should be re-exported`);
const exportTo = dryRun ? join(mkdtempSync(join(tmpdir(), 'hang-')), `${slug}.jpg`) : webAbs;
const exp = spawnSync('python3', [resolve(scriptDir, 'export-print-web.py'), source, exportTo], { encoding: 'utf8' });
if (exp.status !== 0) die(`export failed:\n${exp.stderr || exp.stdout}`);
const [w, h, bytes] = exp.stdout.trim().split(/\s+/).map(Number);
const aspect = String(Math.round((w / h) * 1000) / 1000);
const shape = w / h < 0.9 ? 'tall' : w / h < 1.3 ? 'mid' : 'wide';
console.log(`export  ${webRel}  ${w}x${h}  ${(bytes / 1024).toFixed(0)}K  aspect ${aspect} → .${shape}`);

// ── 2. prints/index.html ─────────────────────────────────────────────────
const alt = `${escAttr(title)} — fine art print by Fola Adeleke`;
const firstSize = sizes.split('/')[0].trim();
const newHang =
`        <a class="hang ${shape} " href="#${slug}" id="${slug}"
           data-n="${number}" data-title="${escAttr(title)}" data-edition="${escAttr(edition)}" data-sizes="${escAttr(sizes)}" data-aspect="${aspect}"${shopUrl ? ` data-shop="${escAttr(shopUrl)}"` : ''}${pair ? ` data-pair="${pair}"` : ''} data-new="1">
          <span class="flag">New</span>
          <div class="frame"><div class="paper"><img src="/${webRel}" width="${w}" height="${h}" alt="${alt}" decoding="async" /></div></div>
          <div class="tomb"><b>${escText(title)}</b><span>${escText(edition)} · ${escText(firstSize)}</span></div>
          <p class="caption" hidden>${escText(caption)}</p>
        </a>
`;

let entranceHtml = entrance.html
  .replace(/No\. \d+\./, `No. ${number}.`)
  .replace(outgoing ?? /(?=\n {6}<\/section>)/, outgoing ? newHang : `\n${newHang.replace(/\n$/, '')}`);
prints = prints.slice(0, entrance.start) + entranceHtml + prints.slice(entrance.end);

if (outgoing) {
  const room = section(prints, moveTo);
  const nudges = [...room.html.matchAll(/<a class="hang \w+ ?(up|down)?/g)].map((m) => m[1] ?? '');
  const last = nudges[nudges.length - 1] ?? '';
  const nudge = last ? '' : (nudges[nudges.length - 2] === 'up' ? 'down' : 'up');
  const moved = outgoing
    .replace(/<a class="hang (\w+) ?(?:up|down)?"/, `<a class="hang $1 ${nudge}"`)
    .replace(/ decoding="async" \/>/, (m, off, s) => (s.includes('loading="lazy"') ? m : ` loading="lazy"${m}`));
  const count = nudges.length + 1;
  const roomHtml = room.html
    .replace(/<div class="n">\d+ works?<\/div>/, `<div class="n">${count} work${count === 1 ? '' : 's'}</div>`)
    .replace(/\n {6}<\/section>$/, `\n${moved.replace(/\n$/, '')}\n      </section>`);
  prints = prints.slice(0, room.start) + roomHtml + prints.slice(room.end);
  console.log(`move    ${/id="([^"]+)"/.exec(outgoing)[1]} → Room ${moveTo} (${count} works), nudge "${nudge || 'centre'}"`);
}

// data-new on the three highest plate numbers only.
const keepNew = new Set([...plateNumbers, number].sort((a, b) => b - a).slice(0, 3));
prints = prints.replace(HANG_RE, (block) => {
  const n = Number(/data-n="(\d+)"/.exec(block)[1]);
  if (keepNew.has(n) || !block.includes('data-new="1"')) return block;
  console.log(`unflag  No. ${n} is no longer new`);
  return block.replace(/ data-new="1"/, '').replace(/^ {10}<span class="flag">New<\/span>\n/m, '');
});
const total = plateNumbers.length + 1;
prints = prints.replace(/(<span id="whereCount">01 \/ )\d+(<\/span>)/, `$1${total}$2`);

// ── 3. index.html featured strip ─────────────────────────────────────────
let home = readFileSync(HOME, 'utf8');
const gridStart = home.indexOf('<div class="featured-grid">');
if (gridStart === -1) die('no .featured-grid in index.html');
const gridEnd = home.indexOf('\n      </div>', gridStart) + 1;
const grid = home.slice(gridStart, gridEnd);
const items = grid.match(/^ {8}<a class="featured-item[\s\S]*?^ {8}<\/a>\n/gm) ?? [];
const newItem =
`        <a class="featured-item fade-up" href="/prints#${slug}" style="animation-delay: 0.05s;">
          <div class="featured-item-frame"><img src="/${webRel}" alt="${alt}" loading="lazy" decoding="async"/></div>
          <p class="featured-item-name">${escText(title)}</p>
        </a>
`;
const delays = ['0.05s', '0.18s', '0.3s', '0.42s'];
const strip = [newItem, ...items].slice(0, 4).map((it, i) => it.replace(/animation-delay: [\d.]+s;/, `animation-delay: ${delays[i]};`));
home = home.slice(0, gridStart) + '<div class="featured-grid">\n' + strip.join('') + home.slice(gridEnd);
if (items.length >= 4) console.log(`home    featured strip drops ${/featured-item-name">([^<]+)</.exec(items[items.length - 1])[1]}`);

// ── 4. design.md ─────────────────────────────────────────────────────────
let design = readFileSync(DESIGN, 'utf8');
const designRe = /drop \(No\. \d+, [^)]*?, at the time of writing\)/;
if (!designRe.test(design)) console.warn('warn    design.md: "at the time of writing" line not found, left alone');
design = design.replace(designRe, `drop (No. ${number}, ${title}, at the time of writing)`);

// ── 5. sitemap.xml ───────────────────────────────────────────────────────
let sitemap = readFileSync(SITEMAP, 'utf8');
for (const loc of ['https://folaadeleke.com/', 'https://folaadeleke.com/prints']) {
  sitemap = sitemap.replace(new RegExp(`(<loc>${loc.replace(/[.]/g, '\\.')}</loc>\\s*<lastmod>)[^<]+`), `$1${today}`);
}

// ── write, stage, check ──────────────────────────────────────────────────
if (dryRun) {
  console.log(`\n[dry run] would write prints/index.html, index.html, design.md, sitemap.xml and ${webRel}; nothing written.`);
  console.log(`[dry run] export left at ${exportTo} for inspection.`);
  process.exit(0);
}
writeFileSync(PRINTS, prints);
writeFileSync(HOME, home);
writeFileSync(DESIGN, design);
writeFileSync(SITEMAP, sitemap);
const touched = ['prints/index.html', 'index.html', 'design.md', 'sitemap.xml', webRel];
execFileSync('git', ['add', '--', ...touched], { cwd: repoRoot });
console.log(`staged  ${touched.join(', ')}`);

const check = spawnSync('node', [resolve(scriptDir, 'check-site.mjs')], { cwd: repoRoot, encoding: 'utf8' });
process.stdout.write(check.stdout);
process.stderr.write(check.stderr);
if (check.status !== 0) die('guardrails failed — fix the problems above before committing');

if (shopUrl) {
  try {
    const res = await fetch(shopUrl, { method: 'HEAD', redirect: 'follow' });
    console.log(res.ok ? `shop    ${shopUrl} is live` : `warn    ${shopUrl} returned ${res.status} — publish the product in Shopify or the Acquire button will 404`);
  } catch (e) {
    console.log(`warn    could not reach ${shopUrl} (${e.message})`);
  }
}

console.log(`
Hung No. ${number} ${title} at the Entrance (/prints#${slug}).
Next:
  git commit -m "Hang ${title} at the Entrance"
  git push
Then look at it once on a phone, and consider the newsletter — this script does not touch it.`);
