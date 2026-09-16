#!/usr/bin/env node
// Scaffolds a numbered newsletter issue from the house template.
//
//   node scripts/new-newsletter.mjs --items 3 --hero papas-girl --band
//       → newsletter-issue-005.html with three numbered items, the hero
//         filled from the gallery wall, the inverted band kept, and
//         every remaining [PLACEHOLDER] left for you to write.
//
//   node scripts/new-newsletter.mjs --example > issue-005.json
//   node scripts/new-newsletter.mjs --brief issue-005.json
//       → the same, but with copy, links and images filled from a brief,
//         so the output is ready to paste.
//
//   --number N     Issue number; defaults to the next after the highest
//                  newsletter-issue-NNN.html in the repo.
//   --items N      Numbered items (default 3). A brief sets this itself.
//   --hero SLUG    Lead with a print from the wall: image, title, plate
//                  number and shop link come from prints/index.html.
//                  --hero none drops the hero block.
//   --band         Keep the inverted band (one per issue, off by default).
//   --row          Keep the 3-up tile row (off by default).
//   --dry-run      Print the result instead of writing it.
//
// The template is read block by block using its own ══ markers, so this
// never drifts from newsletter-template.html: change the template and the
// next issue picks it up. Blocks the issue does not use are omitted, item
// numerals are renumbered, and the template's design spec is left where
// it lives, in the template.
//
// What it will not do: send. Push first so every image is live, then in
// Beehiiv: New Post → Custom HTML → paste everything between <body>.

import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TEMPLATE = resolve(repoRoot, 'newsletter-template.html');
const SITE = 'https://folaadeleke.com';

// ── args ─────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const opts = {};
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (!a.startsWith('--')) die(`unexpected argument ${a}`);
  const key = a.slice(2);
  if (['band', 'row', 'dry-run', 'example'].includes(key)) { opts[key] = true; continue; }
  if (i + 1 >= argv.length) die(`--${key} needs a value`);
  opts[key] = argv[++i];
}
function die(msg) { console.error(`new-newsletter: ${msg}`); process.exit(1); }

if (opts.example) {
  console.log(JSON.stringify(EXAMPLE_BRIEF(), null, 2));
  process.exit(0);
}

const brief = opts.brief ? JSON.parse(readFileSync(resolve(repoRoot, opts.brief), 'utf8')) : null;
const number = Number(opts.number ?? brief?.number ?? nextNumber());
if (!Number.isInteger(number) || number < 1) die('--number must be a positive integer');
const nnn = String(number).padStart(3, '0');
const outFile = `newsletter-issue-${nnn}.html`;
if (existsSync(resolve(repoRoot, outFile)) && !opts['dry-run']) die(`${outFile} already exists — pass --number for a different issue`);

function nextNumber() {
  const nums = readdirSync(repoRoot).map((f) => /^newsletter-issue-(\d+)\.html$/.exec(f)?.[1]).filter(Boolean).map(Number);
  return nums.length ? Math.max(...nums) + 1 : 1;
}

// ── the wall, for --hero and item lookups ────────────────────────────────
function workFromWall(slug) {
  const wall = readFileSync(resolve(repoRoot, 'prints/index.html'), 'utf8');
  const m = new RegExp(`<a class="hang[^"]*" href="#${slug}" id="${slug}"\\n([^\\n]*)>`).exec(wall);
  if (!m) return null;
  const attr = (n) => new RegExp(`\\b${n}="([^"]*)"`).exec(m[1])?.[1] ?? null;
  const img = new RegExp(`id="${slug}"[\\s\\S]*?<img src="([^"]+)"`).exec(wall)?.[1];
  return {
    slug, title: attr('data-title'), n: attr('data-n'), edition: attr('data-edition'),
    shop: attr('data-shop') ?? `${SITE}/prints#${slug}`, image: img?.replace(/^\//, ''),
    alt: `${attr('data-title')} — fine art print by Fola Adeleke`,
  };
}

// ── template blocks ──────────────────────────────────────────────────────
const tpl = readFileSync(TEMPLATE, 'utf8');
function block(startMarker, endMarker) {
  const start = tpl.indexOf(`<!-- ══ ${startMarker} ══`);
  if (start === -1) die(`template has no "${startMarker}" block`);
  // Unmarked blocks end at the blank lines before the next block, or at
  // the container's closing </table> for the last one (the footer).
  const end = endMarker ? tpl.indexOf(`<!-- ══ ${endMarker} ══ -->`, start)
    : Math.min(...['\n\n\n', '\n\n        </table>'].map((m) => tpl.indexOf(m, start)).filter((i) => i !== -1));
  if (end === -1) die(`template "${startMarker}" block has no end`);
  const endLen = endMarker ? `<!-- ══ ${endMarker} ══ -->`.length : 0;
  return tpl.slice(start, end + endLen).replace(/\s+$/, '') + '\n';
}
// The template's how-to and design-spec comment stays in the template;
// the issue gets a short header saying where it came from.
const head = tpl.slice(0, tpl.indexOf('          <!-- ══ HEADER ══ -->'))
  .replace(/<!--\n  ═+[\s\S]*?-->\n/, `<!--
  ════════════════════════════════════════════════════════════════
  FOLA ADELEKE® — NEWSLETTER ISSUE No. ${nnn}
  Generated from newsletter-template.html by scripts/new-newsletter.mjs.
  The design spec and the before-sending checklist live in the template.
  ════════════════════════════════════════════════════════════════
-->
`);
const tail = tpl.slice(tpl.indexOf('        </table>\n\n      </td>'));
const B = {
  header: block('HEADER'),
  hero: block('HERO IMAGE', 'END HERO'),
  intro: block('HEADLINE + INTRO'),
  item: block('NUMBERED ITEM', 'END NUMBERED ITEM'),
  band: block('INVERTED BAND', 'END INVERTED BAND'),
  row: block('3-UP ROW', 'END 3-UP ROW'),
  signoff: block('SIGN-OFF'),
  footer: block('FOOTER'),
};

const esc = (s) => String(s).replace(/&(?![a-z#0-9]+;)/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const imgUrl = (p) => /^https?:/.test(p) ? p : `${SITE}/${p.replace(/^\//, '')}`;
// Replace a [PLACEHOLDER] (the bracket text may carry a hint after a dash) with a value.
function fill(html, name, value) {
  if (value == null) return html;
  return html.replace(new RegExp(`\\[${name}(?:\\s+—[^\\]]*)?\\]`, 'g'), esc(value));
}

// ── assemble ─────────────────────────────────────────────────────────────
// The hero stays unless asked to go (--hero none, or a brief without "hero"):
// leading with the work is the point of the design.
const wantHero = opts.hero !== 'none' && !(brief && brief.hero === undefined);
let heroData = null;
if (wantHero) {
  const spec = brief?.hero ?? opts.hero ?? {};
  if (typeof spec === 'string') {
    heroData = workFromWall(spec) ?? die(`--hero ${spec}: no such print on the wall`);
    heroData = { image: heroData.image, link: heroData.shop, title: heroData.title, meta: `No. ${heroData.n} · ${heroData.edition}`, alt: heroData.alt };
  } else if (spec && typeof spec === 'object') {
    heroData = spec.work ? { ...(() => { const w = workFromWall(spec.work) ?? die(`hero.work ${spec.work}: no such print`); return { image: w.image, link: w.shop, title: w.title, meta: `No. ${w.n} · ${w.edition}`, alt: w.alt }; })(), ...spec } : spec;
  }
}

const items = brief?.items ?? Array.from({ length: Number(opts.items ?? 3) }, () => ({}));
if (!items.length) die('an issue needs at least one item');

let out = head.replace('[SUBJECT LINE]', brief?.subject ? esc(brief.subject) : '[SUBJECT LINE]');
out += B.header.replace('[NNN]', nnn) + '\n\n';

if (heroData) {
  let h = B.hero;
  if (heroData.image) h = h.replace('https://folaadeleke.com/images/[HERO IMAGE].jpg', imgUrl(heroData.image));
  h = fill(h, 'HERO LINK', heroData.link);
  h = fill(h, 'HERO ALT TEXT', heroData.alt);
  h = fill(h, 'WORK TITLE', heroData.title);
  h = fill(h, 'CAPTION META', heroData.meta);
  out += h + '\n\n';
}

{
  let s = B.intro;
  s = fill(s, 'HEADLINE', brief?.headline);
  s = fill(s, 'OPENING PARAGRAPH', brief?.intro);
  if (brief && !brief.intro2) s = s.replace(/\s*<p style="margin:0; font-family:Helvetica[^>]*>\s*\[SECOND PARAGRAPH[^\]]*\]\s*<\/p>/, '');
  else s = fill(s, 'SECOND PARAGRAPH', brief?.intro2);
  out += s + '\n\n';
}

items.forEach((it, i) => {
  let s = B.item.replace('01 &nbsp;&middot;&nbsp;', `${String(i + 1).padStart(2, '0')} &nbsp;&middot;&nbsp;`);
  const w = it.work ? workFromWall(it.work) ?? die(`items[${i}].work ${it.work}: no such print`) : null;
  const v = w ? { label: 'New print', headline: w.title, link: w.shop, linkText: 'Acquire', image: w.image, alt: w.alt, ...it } : it;
  if (brief && !v.image) {
    s = s.replace(/\s*<!-- item image[^>]*-->\s*<a href="\[ITEM LINK\]"[\s\S]*?<\/a>/, '');
  } else if (v.image) {
    s = s.replace('https://folaadeleke.com/images/[ITEM IMAGE].jpg', imgUrl(v.image));
  }
  s = fill(s, 'SECTION LABEL', v.label);
  s = fill(s, 'ITEM HEADLINE', v.headline);
  s = fill(s, 'ITEM COPY', v.copy);
  s = fill(s, 'ITEM LINK', v.link);
  s = fill(s, 'ITEM ALT TEXT', v.alt);
  s = fill(s, 'LINK TEXT', v.linkText);
  out += s + '\n\n';
});

if (opts.band || brief?.band) {
  let s = B.band;
  const b = brief?.band ?? {};
  s = fill(s, 'BAND LABEL', b.label); s = fill(s, 'BAND HEADLINE', b.headline); s = fill(s, 'BAND COPY', b.copy);
  s = fill(s, 'BAND BUTTON LINK', b.link); s = fill(s, 'BUTTON TEXT', b.button);
  out += s + '\n\n';
}

if (opts.row || brief?.row) {
  let s = B.row;
  const r = brief?.row ?? {};
  s = fill(s, 'ROW LABEL', r.label);
  (r.tiles ?? []).slice(0, 3).forEach((t, i) => {
    const w = t.work ? workFromWall(t.work) ?? die(`row.tiles[${i}].work ${t.work}: no such print`) : null;
    // Tiles must share one aspect ratio: prefer a 480x600 crop in images/newsletter/welcome/,
    // fall back to the wall export (its own ratio) with a warning.
    const tile = w && existsSync(resolve(repoRoot, `images/newsletter/welcome/tile-${w.slug}.jpg`)) ? `images/newsletter/welcome/tile-${w.slug}.jpg` : w?.image;
    if (w && tile === w.image) console.log(`warn   row tile ${w.slug}: no 480x600 crop at images/newsletter/welcome/tile-${w.slug}.jpg, using the wall export — the row will not align until one is made`);
    const v = w ? { link: w.shop, title: w.title, alt: w.alt, image: tile, ...t } : t;
    if (v.image) s = s.replace(`https://folaadeleke.com/images/[TILE ${i + 1}].jpg`, imgUrl(v.image));
    s = fill(s, `TILE ${i + 1} LINK`, v.link); s = fill(s, `TILE ${i + 1} ALT`, v.alt); s = fill(s, `TILE ${i + 1} TITLE`, v.title);
  });
  out += s + '\n\n';
}

out += B.signoff + '\n\n' + B.footer + '\n\n' + tail;
out = fill(out, 'PREHEADER', brief?.preheader);

// ── report ───────────────────────────────────────────────────────────────
const left = [...new Set([...out.matchAll(/\[[A-Z][A-Z0-9 ]*(?:—[^\]]*)?\]/g)].map((m) => m[0]))];
const missing = [...out.matchAll(/https:\/\/folaadeleke\.com\/((?:images|js)\/[^"\s\]]+)/g)].map((m) => m[1]).filter((p) => !existsSync(resolve(repoRoot, p)));

if (opts['dry-run']) { process.stdout.write(out); process.exit(0); }
writeFileSync(resolve(repoRoot, outFile), out);
console.log(`new-newsletter: wrote ${outFile} — Issue No. ${nnn}, ${items.length} item${items.length === 1 ? '' : 's'}${heroData ? ', hero' : ''}${opts.band || brief?.band ? ', band' : ''}${opts.row || brief?.row ? ', 3-up row' : ''}.`);
if (left.length) console.log(`still to write (${left.length}): ${left.join(', ')}`);
for (const p of missing) console.log(`warn   ${p} is referenced but not in the repo — it will be a broken box in the inbox until it is added and pushed`);
console.log(`
Next:
  1. Write the copy (search the file for "[").
  2. git add ${outFile} && git commit   — the guardrails check every link and image.
  3. git push, THEN paste into Beehiiv (New Post → Custom HTML → everything between <body>).
  4. Send yourself a test; check desktop and mobile in Beehiiv's preview.`);

function EXAMPLE_BRIEF() {
  return {
    number: nextNumber(),
    subject: 'Five things',
    preheader: 'A new print at the door, a magazine feature, and a concept kit.',
    hero: 'papas-girl',
    headline: 'Five things',
    intro: 'Opening paragraph, set in Helvetica so it can actually be read.',
    intro2: 'Optional second paragraph in the lighter grey. Delete this key to drop it.',
    items: [
      { work: 'papas-girl', copy: 'A "work" item fills the label, headline, image, alt and shop link from the gallery wall; add copy and you are done.' },
      { label: 'In the press', headline: 'Lemile Magazine', copy: 'A free-form item: label, headline, copy, link and an optional image.', link: 'https://folaadeleke.com/press', linkText: 'Read the feature', image: 'images/lemile-magazine/portrait.jpg', alt: 'Fola Adeleke photographed for Lemile Magazine' },
      { label: 'Studio', headline: 'No image on this one', copy: 'Leave out "image" and the item is text only.', link: 'https://folaadeleke.com/artist', linkText: 'How the work is made' },
    ],
    band: { label: 'Print drop', headline: 'Find the five', copy: 'One band per issue, for the single thing you most want acted on. Delete this key to drop it.', link: 'https://folaadeleke.com/find', button: 'Play now' },
    row: { label: 'From the archive', tiles: [{ work: 'sisterhood' }, { work: 'loud-celebration' }, { work: 'girl-dad' }] },
  };
}
