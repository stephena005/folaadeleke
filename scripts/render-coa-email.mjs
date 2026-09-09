#!/usr/bin/env node
// Renders the digital certificate delivery email for one buyer.
//
//   node scripts/render-coa-email.mjs \
//     --certificate "back-office/certificates/html/<buyer>-<work>-a2.html"
//
// The hero image is looked up by work in images/newsletter/coa/manifest.json,
// which scripts/export-coa-heroes.py writes. Pass --work-image to override.
//
// Fills coa-email.html from the certificate itself and writes the result into
// back-office/, which is gitignored. --data <json> takes the same fields from
// a JSON file instead, for a certificate that has not been generated yet;
// prefer --certificate, because a hand-kept JSON drifts from the certificate
// it describes and nothing catches it.
//
// The email's button goes to the same URL the QR code on the printed
// certificate encodes: https://folaadeleke.com/verify/<token>/. The token is
// not in the certificate JSON, so this script finds it by matching the work,
// the edition and the buyer against the pages in verify/. That match is the
// point: it is how the button cannot end up pointing at another buyer's
// certificate. Pass --verify-url to override, and it is checked against the
// match rather than trusted.
//
// The rendered file carries the buyer's full name against their edition.
// This repository is public and GitHub Pages serves its root, so a rendered
// copy committed anywhere git tracks would be readable at folaadeleke.com —
// which is how back-office/ was exposed for three months. This script
// refuses to write to a path git does not ignore unless you pass --force.

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { readCertificate, CertificateError, decodeEntities, escapeHtml, slugify } from './lib/certificate.mjs';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '..');

const TEMPLATE = resolve(repoRoot, 'coa-email.html');
const DEFAULT_OUT_DIR = resolve(repoRoot, 'back-office/certificates/emails');
const VERIFY_DIR = resolve(repoRoot, 'verify');
const VERIFY_BASE = 'https://folaadeleke.com/verify';
const HERO_DIR = resolve(repoRoot, 'images/newsletter/coa');
const HERO_BASE = 'https://folaadeleke.com/images/newsletter/coa';

function fail(message) {
  console.error(`render-coa-email: ${message}`);
  process.exit(1);
}

function warn(message) {
  console.warn(`render-coa-email: warning: ${message}`);
}

function parseArgs(argv) {
  const out = { flags: new Set() };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) {
      out.flags.add(key);
      continue;
    }
    out[key] = next;
    i += 1;
  }
  return out;
}

// ── the sign-off reads "Two of fifteen", not "2 of 15" ───────────────────
const ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight',
  'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen',
  'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

function toWords(value) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > 99) return String(value); // fall back to the digits
  if (n < 20) return ONES[n];
  const tens = TENS[Math.floor(n / 10)];
  const ones = n % 10;
  return ones ? `${tens}-${ONES[ones]}` : tens;
}

function capitalise(word) {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

function firstMatch(html, pattern) {
  const found = html.match(pattern);
  return found ? decodeEntities(found[1]).trim() : null;
}

// What each deployed verify page says it certifies.
function readVerifyPages() {
  if (!existsSync(VERIFY_DIR)) return [];
  return readdirSync(VERIFY_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const page = resolve(VERIFY_DIR, entry.name, 'index.html');
      if (!existsSync(page)) return null;
      const html = readFileSync(page, 'utf8');
      return {
        token: entry.name,
        title: firstMatch(html, /<div class="title">([\s\S]*?)<\/div>/),
        editionNumber: firstMatch(html, /<span class="edition-num">([\s\S]*?)<\/span>/),
        editionTotal: firstMatch(html, /<span class="edition-total">([\s\S]*?)<\/span>/),
        issuedTo: firstMatch(html, /Issued To<\/div>\s*<div class="footer-value">([\s\S]*?)<\/div>/),
      };
    })
    .filter(Boolean);
}

// Names on the verify pages are deliberately anonymised for private buyers
// (see verify/), so the buyer cannot be the primary key any more.
const ANONYMISED = new Set(['private collection']);

// A work plus an edition number identifies exactly one certificate — that is
// what an edition *is* — so match on those, then use the buyer as a check
// rather than as the lookup. A page that still names a buyer and names a
// different one than the data is a wrong-buyer signal, and stops the render.
function findVerifyToken(data) {
  const want = {
    title: slugify(data.title),
    issuedTo: slugify(data.issuedTo),
    editionNumber: String(data.editionNumber).trim(),
    editionTotal: String(data.editionTotal).trim(),
  };

  const sameEdition = readVerifyPages().filter((page) => page.title
    && slugify(page.title) === want.title
    && String(page.editionNumber) === want.editionNumber
    && String(page.editionTotal) === want.editionTotal);

  if (sameEdition.length <= 1) return sameEdition;

  // More than one page for one edition should not happen. If it does, fall
  // back to the buyer to disambiguate rather than guessing.
  const byBuyer = sameEdition.filter((page) => slugify(page.issuedTo) === want.issuedTo);
  return byBuyer.length === 1 ? byBuyer : sameEdition;
}

// Does the page name someone other than the buyer this email is for?
function contradictsBuyer(page, data) {
  const named = (page.issuedTo ?? '').trim();
  if (!named || ANONYMISED.has(named.toLowerCase())) return false;
  return slugify(named) !== slugify(data.issuedTo);
}

function isTracked(path) {
  // A path outside this repository cannot be published by it.
  if (relative(repoRoot, path).startsWith('..')) return false;
  try {
    execFileSync('git', ['check-ignore', '-q', path], { cwd: repoRoot, stdio: 'ignore' });
    return false; // exit 0 means git ignores it
  } catch (error) {
    if (error.status === 1) return true; // exit 1 means git would track it
    return true; // no git, or some other failure — assume the risky answer
  }
}

async function headStatus(url) {
  try {
    const response = await fetch(url, { method: 'HEAD', redirect: 'follow',
      signal: AbortSignal.timeout(15000) });
    return response.status;
  } catch {
    return null;
  }
}

const args = parseArgs(process.argv.slice(2));

if (args.flags.has('help') || args.flags.has('h')) {
  console.log(readFileSync(fileURLToPath(import.meta.url), 'utf8')
    .split('\n').filter((line) => line.startsWith('//')).join('\n'));
  process.exit(0);
}

if (!args.certificate && !args.data) {
  fail('give the certificate to render from:\n'
    + '    --certificate back-office/certificates/html/<file>.html   (preferred)\n'
    + '    --data        <json with the same fields>\n'
    + '  There is no default. A default would mean rendering one buyer\'s\n'
    + '  certificate whenever the flag is forgotten, and every value here is\n'
    + '  buyer-specific.');
}
if (args.certificate && args.data) fail('pass --certificate or --data, not both');

const sourcePath = resolve(repoRoot, args.certificate ?? args.data);
if (!existsSync(sourcePath)) fail(`nothing to read at ${sourcePath}`);
if (!existsSync(TEMPLATE)) fail(`no template at ${TEMPLATE}`);

let data;
if (args.certificate) {
  try {
    // The certificate is the record; read the fields straight out of it.
    data = readCertificate(sourcePath, relative(repoRoot, sourcePath)).text;
  } catch (error) {
    if (error instanceof CertificateError) fail(error.message);
    throw error;
  }
} else {
  try {
    data = JSON.parse(readFileSync(sourcePath, 'utf8'));
  } catch (error) {
    fail(`${sourcePath} is not valid JSON — ${error.message}`);
  }
}

// The hero is looked up, not derived: scripts/export-coa-heroes.py owns the
// filename rule, and a second copy of it here — in another language — would
// drift, with a broken image in a buyer's inbox as the first sign.
function heroFor(title) {
  const manifestPath = resolve(HERO_DIR, 'manifest.json');
  if (!existsSync(manifestPath)) {
    fail('no images/newsletter/coa/manifest.json — run: python3 scripts/export-coa-heroes.py');
  }
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const file = manifest[title]
    ?? Object.entries(manifest).find(([work]) => slugify(work) === slugify(title))?.[1];
  if (!file) {
    fail(`no hero image exported for "${title}".\n`
      + '  Run: python3 scripts/export-coa-heroes.py\n'
      + `  If the work is new, check the title matches the certificate exactly.`);
  }
  return `${HERO_BASE}/${file}`;
}

const workImage = args['work-image'] ?? heroFor(data.title);

const required = ['title', 'year', 'editionNumber', 'editionTotal', 'issuedTo', 'medium', 'dimensions'];
const missing = required.filter((key) => !data[key]);
if (missing.length) fail(`${relative(repoRoot, sourcePath)} is missing: ${missing.join(', ')}`);

const signedDate = data.signedDate ?? args['signed-date'];
if (!signedDate) {
  fail('no signed date — add "signedDate" to the certificate data, or pass --signed-date "04 Sep 2026"');
}

// ── the verify link: found, not trusted ─────────────────────────────────
if (!/^https:\/\//i.test(workImage)) fail('--work-image must be an absolute https URL');

const collectorSlug = slugify(data.issuedTo);
const titleSlug = slugify(data.title);

const matches = findVerifyToken(data);
if (matches.length > 1) {
  fail(`${matches.length} verify pages match this certificate (${matches.map((m) => m.token).join(', ')}).\n`
    + '  Two pages certify the same work, edition and buyer. Fix that before sending.');
}
if (matches.length === 0) {
  fail(`no verify page in verify/ certifies ${data.title} ${data.editionNumber}/${data.editionTotal}\n`
    + `  for ${data.issuedTo}. Build the certificate's verify page first — the button in\n`
    + '  this email is the same URL the QR code on the print encodes, so without that\n'
    + '  page there is nothing for it to open.');
}

if (contradictsBuyer(matches[0], data)) {
  fail(`the verify page for ${data.title} ${data.editionNumber}/${data.editionTotal} names\n`
    + `  ${matches[0].issuedTo}, but this certificate is issued to ${data.issuedTo}.\n`
    + '  Refusing to send one buyer a link to another buyer\'s certificate.');
}

const verifyUrl = `${VERIFY_BASE}/${matches[0].token}/`;

// An override is checked against the match, never trusted over it: pointing a
// buyer at another buyer's certificate is the one unrecoverable mistake here.
const override = args['verify-url'];
if (override) {
  if (!/^https:\/\//i.test(override)) fail('--verify-url must be an absolute https URL');
  const overrideToken = new URL(override).pathname.replace(/^\/verify\//, '').replace(/\/$/, '');
  if (overrideToken !== matches[0].token) {
    fail(`--verify-url points at ${overrideToken || override}, but the verify page for\n`
      + `  ${data.issuedTo}'s ${data.editionNumber}/${data.editionTotal} is ${matches[0].token}.\n`
      + '  Refusing to send one buyer a link to another buyer\'s certificate.');
  }
}

const fields = {
  '[WORK TITLE]': escapeHtml(data.title),
  '[YEAR]': escapeHtml(data.year),
  '[EDITION NO]': escapeHtml(data.editionNumber),
  '[EDITION TOTAL]': escapeHtml(data.editionTotal),
  '[EDITION NO WORD]': capitalise(toWords(data.editionNumber)),
  '[EDITION TOTAL WORD]': toWords(data.editionTotal),
  '[COLLECTOR NAME]': escapeHtml(data.issuedTo),
  '[FIRST NAME]': escapeHtml(String(data.issuedTo).trim().split(/\s+/)[0]),
  '[MEDIUM]': escapeHtml(data.medium),
  '[DIMENSIONS]': escapeHtml(data.dimensions),
  '[SIGNED DATE]': escapeHtml(signedDate),
  '[CERT REF]': escapeHtml(data.certRef ?? ''),
  '[VERIFY URL]': escapeHtml(verifyUrl),
  '[WORK IMAGE URL]': escapeHtml(workImage),
};

let html = readFileSync(TEMPLATE, 'utf8');

// Drop the template's own instruction comment — it documents the render step
// and has no business in a buyer's inbox.
html = html.replace(/<!--\n {2}═+\n {2}FOLA ADELEKE® — DIGITAL CERTIFICATE[\s\S]*?-->\n/, '');

// No certRef in the data means no reference line, not an empty label.
if (data.certRef) {
  html = html.replace(/\s*<!-- REF:START[^>]*-->/, '').replace(/\s*<!-- REF:END -->/, '');
} else {
  html = html.replace(/\n\s*<!-- REF:START[\s\S]*?<!-- REF:END -->/, '');
}

for (const [token, value] of Object.entries(fields)) {
  html = html.split(token).join(value);
}

const leftovers = [...new Set(html.match(/\[[A-Z][A-Z ]+\]/g) ?? [])];
if (leftovers.length) fail(`unfilled placeholders left in the render: ${leftovers.join(', ')}`);

// ── where it may be written ──────────────────────────────────────────────
const outPath = args.out
  ? resolve(repoRoot, args.out)
  : resolve(DEFAULT_OUT_DIR, `${collectorSlug}-${titleSlug}-${slugify(data.editionNumber)}-of-${slugify(data.editionTotal)}.html`);

if (isTracked(outPath) && !args.flags.has('force')) {
  fail(`refusing to write ${relative(repoRoot, outPath)} — git does not ignore that path, and\n`
    + '  this render carries the buyer\'s name and their private certificate link. This\n'
    + '  repository is public and serves its root at folaadeleke.com. Write it under\n'
    + '  back-office/ instead, or pass --force if you are certain.');
}

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, html);

const shownPath = relative(repoRoot, outPath).startsWith('..') ? outPath : relative(repoRoot, outPath);
console.log(`render-coa-email: wrote ${shownPath}`);
console.log(`  ${data.title} — ${data.editionNumber}/${data.editionTotal} — ${data.issuedTo}`);
console.log(`  verify link: ${verifyUrl}`);
if (!data.certRef) console.log('  no certRef in the data, so the reference line was dropped');

// ── the image must already be live, or it is a broken box in the inbox ───
if (!args.flags.has('no-check')) {
  const status = await headStatus(workImage);
  if (status === 200) {
    console.log('  work image is live (200)');
  } else if (status === null) {
    warn('could not reach the work image — check it is deployed before sending');
  } else {
    warn(`the work image returned ${status}. Deploy it before sending, or the email`);
    warn('  arrives with a broken box where the print should be.');
  }
  const verifyStatus = await headStatus(verifyUrl);
  if (verifyStatus === 200) {
    console.log('  verify page is live (200)');
  } else if (verifyStatus === null) {
    warn('could not reach the verify page — it must be deployed, not just committed');
  } else {
    warn(`the verify page returned ${verifyStatus}. It is committed but evidently not`);
    warn('  deployed yet; the button in this email would land on nothing.');
  }
}

console.log('\n  To send it (beehiiv, one post per buyer):');
console.log('    1. the buyer must be a subscriber — if not, add them and tag them `coa-only`');
console.log('    2. put their email in the manual segment "Certificate recipient"');
console.log('    3. New Post -> + -> Custom HTML -> paste everything inside <body>');
console.log('    4. Audience: Email = "Certificate recipient".  Web = REMOVE EVERY GROUP');
console.log('    5. send yourself a test, then send. Afterwards, empty the segment.');
console.log('\n  The Web Audience is the one that matters: a beehiiv post publishes a');
console.log('  public web version by default, and this email names the buyer against');
console.log('  their edition. Leave a group in there and it is on the open web, on a');
console.log('  domain you cannot purge.');
