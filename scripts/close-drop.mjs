#!/usr/bin/env node
// Closes a Friday puzzle drop once its 24-hour window has ended.
//
//   node scripts/close-drop.mjs               # close every drop whose CAMPAIGN_END has passed
//   node scripts/close-drop.mjs --dry-run     # say what would change, write nothing
//   node scripts/close-drop.mjs --drop find --force   # close /find now, window or not
//
// A drop is any top-level <dir>/index.html that declares
//   var DISCOUNT_CODE = '...';
//   var CAMPAIGN_END  = '...';   // ISO instant
// Once CAMPAIGN_END is behind us, the live page is replaced with the
// closed-state page (scripts/templates/drop-closed.html, the house design
// used for /guess and /rearrange), which takes the shared discount code out
// of the public source and tells late visitors the drop is over.
//
// Nothing else needs touching on close — decisions already baked into the
// site, kept here so nobody "fixes" them:
//   · The home page banner hides itself at BANNER_END; it is not edited.
//     It gets repointed when the NEXT drop is built, not when this one ends.
//   · The path stays in BLOCKED in js/newsletter-popup.js. Closed drops
//     stay exempt from the pop-up; the closed page links to the newsletter
//     itself.
//   · The game is left in git history, not archived anywhere else.
//
// The GitHub Actions workflow .github/workflows/close-drops.yml runs this
// hourly and pushes the result to main, so a Saturday close needs no one
// at a keyboard. It is safe to run by hand as well: with nothing ended it
// changes nothing and exits 0.

import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '..');
const TEMPLATE = resolve(scriptDir, 'templates/drop-closed.html');

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const opt = (name) => { const i = args.indexOf(name); return i === -1 ? null : args[i + 1]; };
const dryRun = flag('--dry-run');
const force = flag('--force');
const only = opt('--drop')?.replace(/^\/|\/$/g, '') ?? null;

function readDrop(dir) {
  const file = resolve(repoRoot, dir, 'index.html');
  if (!existsSync(file)) return null;
  const text = readFileSync(file, 'utf8');
  const code = /var\s+DISCOUNT_CODE\s*=\s*'([^']+)'/.exec(text);
  const end = /var\s+CAMPAIGN_END\s*=\s*'([^']+)'/.exec(text);
  if (!code || !end) return null; // not a live drop (already closed, or not a drop at all)
  const title = /<title>\s*([^<]*?)\s*(?:—|&mdash;|-)\s*Fola/i.exec(text) ?? /<title>\s*([^<]*?)\s*<\/title>/i.exec(text);
  const name = (title?.[1] ?? dir).replace(/\s+/g, ' ').trim();
  return { dir, file, text, code: code[1], end: end[1], endMs: Date.parse(end[1]), name };
}

function findDrops() {
  return readdirSync(repoRoot)
    .filter((d) => !d.startsWith('.') && statSync(resolve(repoRoot, d)).isDirectory())
    .map(readDrop)
    .filter(Boolean);
}

function renderClosed(drop) {
  const tpl = readFileSync(TEMPLATE, 'utf8');
  const nameHtml = drop.name.replace(/&/g, '&amp;');
  return tpl
    .replace(/\{\{NAME_UPPER\}\}/g, nameHtml.toUpperCase())
    .replace(/\{\{NAME\}\}/g, nameHtml)
    .replace(/\{\{ENDED\}\}/g, drop.end);
}

const now = Date.now();
let drops = only ? [readDrop(only)].filter(Boolean) : findDrops();

if (only && drops.length === 0) {
  console.error(`close-drop: ${only}/index.html is not a live drop (no DISCOUNT_CODE + CAMPAIGN_END constants). Already closed?`);
  process.exit(1);
}

const ended = drops.filter((d) => force || (Number.isFinite(d.endMs) && d.endMs <= now));
const live = drops.filter((d) => !ended.includes(d));

for (const d of live) {
  const hours = ((d.endMs - now) / 36e5).toFixed(1);
  console.log(`close-drop: /${d.dir} "${d.name}" (${d.code}) is live until ${d.end} — ${hours}h to go, leaving it.`);
}

if (ended.length === 0) {
  console.log('close-drop: nothing to close.');
  process.exit(0);
}

for (const d of ended) {
  if (force && d.endMs > now) console.log(`close-drop: --force — closing /${d.dir} before its ${d.end} end.`);
  const html = renderClosed(d);

  // The whole point is getting the code out of the source; prove it.
  if (html.includes(d.code) || /CAMPAIGN_END|DISCOUNT_CODE/.test(html)) {
    console.error(`close-drop: rendered page for /${d.dir} still contains the code or constants — refusing to write.`);
    process.exit(1);
  }
  if (dryRun) {
    console.log(`close-drop: [dry run] would replace ${d.dir}/index.html (${d.text.length} chars) with the closed page (${html.length} chars) for "${d.name}", ended ${d.end}.`);
    continue;
  }
  writeFileSync(d.file, html);
  console.log(`close-drop: closed /${d.dir} — "${d.name}" ended ${d.end}; ${d.code} removed from the source.`);
}

if (!dryRun) {
  const names = ended.map((d) => d.name).join(', ');
  console.log(`
Next:
  git add ${ended.map((d) => `${d.dir}/index.html`).join(' ')}
  git commit -m "Close the ${names} drop"
  git push
The home banner hides itself at BANNER_END and /${ended[0].dir} stays in the pop-up BLOCKED list — neither needs editing.
Check Shopify that ${ended.map((d) => d.code).join(', ')} is expired or deleted; this script cannot reach Shopify.`);
}
