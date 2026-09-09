#!/usr/bin/env node
// Builds the public verify page for a certificate — the page its QR code opens.
//
//   python3 scripts/decode-certificate-qr.py     # tokens, from the printed QRs
//   node scripts/generate-verify-pages.mjs --dry-run
//   node scripts/generate-verify-pages.mjs
//
// One directory per certificate, named for the token the printed QR encodes.
// The token is never minted here: the certificates are already posted, so the
// page must be built at the address the QR already points to.
//
// PRIVATE BUYERS ARE NOT NAMED. These pages are public and their tokens are
// visible in this repository, so naming the buyer publishes who owns which
// edition. A stranger scanning the QR needs to know the edition is genuine,
// not who owns it — so the row reads "Private collection" and the printed
// certificate remains the only place the owner's name appears. Commercial
// clients in KEEP_NAMED are named, because for them it reads as provenance.

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { readCertificate, decodeEntities, escapeHtml, CertificateError } from './lib/certificate.mjs';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '..');

const TEMPLATE = resolve(scriptDir, 'templates/verify-page.html');
const TOKENS = resolve(repoRoot, 'back-office/certificates/verify-tokens.json');
const CERT_DIRS = ['back-office/certificates/format-1-split-panel-html', 'back-office/certificates/html'];
const VERIFY_DIR = resolve(repoRoot, 'verify');
const HERO_MANIFEST = resolve(repoRoot, 'images/newsletter/coa/manifest.json');
const HERO_PATH = '/images/newsletter/coa';

const ANONYMOUS = 'Private collection';
const KEEP_NAMED = new Set(['wheatbaker hotel']);

// The artwork shown here is the web export, not the file the certificate
// links. A certificate is a print document and points at the print master —
// SISTERHOOD.jpg is 16372x23177 and 17.9MB — which is fine on the way to a
// press and absurd in a page that displays it in a 295px panel. The exports
// in images/newsletter/coa/ are the same crop at 1120px, already deployed for
// the email, and between 164K and 417K.
function heroes() {
  if (!existsSync(HERO_MANIFEST)) return {};
  return JSON.parse(readFileSync(HERO_MANIFEST, 'utf8'));
}

function artworkFor(cert, manifest) {
  const file = manifest[cert.text.title];
  if (file) return `${HERO_PATH}/${file}`;
  console.warn(`  warning: no web export for "${cert.text.title}" — falling back to the`);
  console.warn('    certificate\'s own image, which may be a print master. Run:');
  console.warn('    python3 scripts/export-coa-heroes.py');
  return cert.artSrc;
}

const NUMBER_WORDS = ['', 'ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT', 'NINE',
  'TEN', 'ELEVEN', 'TWELVE', 'THIRTEEN', 'FOURTEEN', 'FIFTEEN', 'SIXTEEN', 'SEVENTEEN',
  'EIGHTEEN', 'NINETEEN', 'TWENTY'];

function fail(message) {
  console.error(`generate-verify-pages: ${message}`);
  process.exit(1);
}

const argv = process.argv.slice(2);
const args = new Set(argv.filter((a) => a.startsWith('--')).map((a) => a.replace(/^--/, '')));
const onlyIndex = argv.indexOf('--only');
const only = onlyIndex === -1 ? null : argv[onlyIndex + 1];
if (onlyIndex !== -1) args.delete('only');
if (onlyIndex !== -1 && !only) {
  console.error('generate-verify-pages: --only needs a token or a certificate filename');
  process.exit(1);
}

function displayName(issuedTo) {
  return KEEP_NAMED.has(decodeEntities(issuedTo).toLowerCase().trim()) ? issuedTo : ANONYMOUS;
}

function render(template, cert, token, manifest) {
  const total = Number(cert.text.editionTotal);
  const totalWord = NUMBER_WORDS[total];
  if (!totalWord) fail(`${cert.file} has an edition total of ${cert.text.editionTotal}, which has no word form here`);

  const values = {
    TOKEN: token,
    TITLE: cert.raw.title,
    YEAR: cert.raw.year,
    EDITION_NUM: cert.raw.editionNumber,
    EDITION_TOTAL: cert.raw.editionTotal,
    EDITION_TOTAL_WORD: totalWord,
    MEDIUM: cert.raw.medium,
    DIMENSIONS: cert.raw.dimensions,
    ISSUED_TO: displayName(cert.raw.issuedTo),
    SIGNED_DATE: cert.raw.signedDate,
    ART_SRC: escapeHtml(artworkFor(cert, manifest)),
    QR_PATH: cert.qrPath,
  };

  let html = template;
  for (const [key, value] of Object.entries(values)) html = html.split(`{{${key}}}`).join(value);
  const unfilled = [...new Set(html.match(/\{\{[A-Z_]+\}\}/g) ?? [])];
  if (unfilled.length) fail(`template fields left unfilled: ${unfilled.join(', ')}`);
  return html;
}

if (!existsSync(TOKENS)) {
  fail(`no token map at ${relative(repoRoot, TOKENS)} — run: python3 scripts/decode-certificate-qr.py`);
}
const tokens = JSON.parse(readFileSync(TOKENS, 'utf8'));
const template = readFileSync(TEMPLATE, 'utf8');
const manifest = heroes();

const written = [];
const skipped = [];
const named = [];

for (const dir of CERT_DIRS) {
  const abs = resolve(repoRoot, dir);
  if (!existsSync(abs)) continue;
  for (const entry of readdirSync(abs).sort()) {
    if (!entry.endsWith('.html') || entry.includes('example')) continue;
    const token = tokens[entry];
    if (!token) {
      fail(`no token for ${entry} — re-run scripts/decode-certificate-qr.py`);
    }
    if (only && only !== token && only !== entry && only !== entry.replace(/\.html$/, '')) continue;
    const out = resolve(VERIFY_DIR, token, 'index.html');
    if (existsSync(out) && !args.has('overwrite')) {
      skipped.push(`${token}  ${entry}`);
      continue;
    }
    let cert;
    try {
      cert = readCertificate(resolve(abs, entry), relative(repoRoot, resolve(abs, entry)));
    } catch (error) {
      if (error instanceof CertificateError) fail(error.message);
      throw error;
    }
    const html = render(template, cert, token, manifest);
    if (displayName(cert.raw.issuedTo) !== ANONYMOUS) named.push(`${token}  ${cert.text.issuedTo}`);
    if (!args.has('dry-run')) {
      mkdirSync(dirname(out), { recursive: true });
      writeFileSync(out, html);
    }
    written.push(`${token}  ${cert.text.title} ${cert.text.editionNumber}/${cert.text.editionTotal}`);
  }
}

console.log(args.has('dry-run') ? 'generate-verify-pages: DRY RUN, nothing written' : 'generate-verify-pages:');
for (const line of written) console.log(`  ${args.has('dry-run') ? 'would write' : 'wrote'}  verify/${line}`);
if (named.length) {
  console.log('\n  named (commercial clients, not anonymised):');
  for (const line of named) console.log(`    ${line}`);
}
console.log(`\n  ${written.length} page(s), ${skipped.length} already existed and were left alone`);
if (skipped.length && args.has('verbose')) for (const line of skipped) console.log(`    skipped  ${line}`);
