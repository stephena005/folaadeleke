#!/usr/bin/env node
// Sets every <lastmod> in sitemap.xml from git, so the dates stop going
// stale by hand.
//
//   node scripts/update-sitemap.mjs           # rewrite sitemap.xml
//   node scripts/update-sitemap.mjs --check   # exit 1 if it would change
//
// Each <loc> resolves to its tracked file the way GitHub Pages resolves
// it (the file, dir/index.html, or path.html). Its lastmod is the date
// of the last commit that touched that file — or today, when the file
// is staged right now, because the commit about to be made is the one
// that changes it. The pre-commit hook runs this and re-stages the
// sitemap, so a page's date moves in the same commit as the page.
//
// The <loc> list itself is still curated by hand: unlisted pages (drops,
// the trade programme, verify pages) are unlisted on purpose.

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, posix, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SITEMAP = resolve(repoRoot, 'sitemap.xml');
const SITE = 'https://folaadeleke.com';

function git(...args) {
  return execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8' }).trim();
}

// Local calendar date, matching git's %cs for a commit made now.
function localToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function pageFile(loc, trackedSet) {
  let p = loc.startsWith(SITE) ? loc.slice(SITE.length) : loc;
  p = posix.normalize(p.replace(/^\/+/, '').split(/[?#]/)[0]);
  if (p === '.' || p === '') p = '';
  for (const cand of [p, posix.join(p, 'index.html'), p ? `${p}.html` : null]) {
    if (cand && trackedSet.has(cand)) return cand;
  }
  return null;
}

// Returns { xml, changes: [{loc, from, to}], missing: [loc] }.
export function computeSitemap(xml) {
  const trackedSet = new Set(git('ls-files', '-z').split('\0').filter(Boolean));
  const staged = new Set(git('diff', '--cached', '--name-only', '-z').split('\0').filter(Boolean));
  const today = localToday();
  const changes = [];
  const missing = [];
  const out = xml.replace(/(<loc>\s*)([^<\s]+)(\s*<\/loc>\s*<lastmod>)([^<]*)(<\/lastmod>)/g, (m, a, loc, b, from, c) => {
    const file = pageFile(loc, trackedSet);
    if (!file) { missing.push(loc); return m; }
    const to = staged.has(file) ? today : (git('log', '-1', '--format=%cs', '--', file) || from);
    if (to !== from) changes.push({ loc, from, to });
    return `${a}${loc}${b}${to}${c}`;
  });
  return { xml: out, changes, missing };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const check = process.argv.includes('--check');
  const before = readFileSync(SITEMAP, 'utf8');
  const { xml, changes, missing } = computeSitemap(before);
  for (const loc of missing) console.error(`update-sitemap: ${loc} does not resolve to a tracked file — left alone`);
  for (const c of changes) console.log(`${check ? 'stale ' : 'set   '} ${c.loc.replace(SITE, '') || '/'}  ${c.from} → ${c.to}`);
  if (check) {
    if (changes.length) { console.error('sitemap.xml is stale — run: node scripts/update-sitemap.mjs'); process.exit(1); }
    console.log('update-sitemap: dates are current.');
  } else if (changes.length) {
    writeFileSync(SITEMAP, xml);
    console.log(`update-sitemap: ${changes.length} date${changes.length === 1 ? '' : 's'} updated.`);
  } else {
    console.log('update-sitemap: nothing to change.');
  }
}
