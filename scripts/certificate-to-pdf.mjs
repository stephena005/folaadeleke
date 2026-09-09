#!/usr/bin/env node
// Renders a certificate HTML to PDF with a real text layer.
//
//   node scripts/certificate-to-pdf.mjs <certificate.html> [--out <file.pdf>]
//   node scripts/certificate-to-pdf.mjs --all-image-only
//
// Some of the certificate PDFs are flat images: the buyer's name and edition
// are pixels, not text, so they cannot be selected, searched or read by a
// screen reader, and a single A5 page runs to megabytes. This prints from the
// HTML through headless Chrome with preferCSSPageSize, so the @page rule in
// the certificate (210mm x 148mm, margin 0) is honoured and everything except
// the artwork stays vector.
//
// Output goes to back-office/certificates/regenerated/ by default and NOTHING
// is overwritten. These PDFs exist on one machine and nowhere else; replacing
// one in place, before anyone has compared it against the original, is not a
// risk worth taking for a file that cannot be recovered.

import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { basename, dirname, resolve, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import puppeteer from 'puppeteer';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = resolve(repoRoot, 'back-office/certificates/regenerated');

function fail(message) {
  console.error(`certificate-to-pdf: ${message}`);
  process.exit(1);
}

const argv = process.argv.slice(2);
const flags = new Set(argv.filter((a) => a.startsWith('--')).map((a) => a.replace(/^--/, '')));
const outIndex = argv.indexOf('--out');
const explicitOut = outIndex === -1 ? null : argv[outIndex + 1];
const targets = argv.filter((a, i) => !a.startsWith('--') && !(outIndex !== -1 && i === outIndex + 1));

// The pages whose PDFs have no text layer, and whose source is the current
// split-panel design. The 300dpi print variants are deliberately rasterised
// and are not touched here; nor is the superseded A4 set.
const IMAGE_ONLY = [
  'wheatbaker-hotel-drowned-in-native-cloth-kehinde-a2',
  'wheatbaker-hotel-drowned-in-native-cloth-taiwo-a2',
  'wheatbaker-hotel-elders-guidance-a2',
  'wheatbaker-hotel-husband-and-wife-a2',
  'wheatbaker-hotel-lagbaja-a2',
  'wheatbaker-hotel-loud-community-a2',
  'wheatbaker-hotel-sundays-best-a2',
  'wheatbaker-hotel-tradition-imagination-a2',
  'wheatbaker-hotel-uncles-stay-lit-a2',
];

const SOURCE_DIR = resolve(repoRoot, 'back-office/certificates/format-1-split-panel-html');

let files;
if (flags.has('all-image-only')) {
  files = IMAGE_ONLY.map((stem) => {
    const p = resolve(SOURCE_DIR, `${stem}.html`);
    if (!existsSync(p)) fail(`no certificate HTML at ${relative(repoRoot, p)}`);
    return p;
  });
} else if (targets.length) {
  files = targets.map((t) => resolve(repoRoot, t));
} else {
  fail('give a certificate HTML, or --all-image-only');
}

mkdirSync(OUT_DIR, { recursive: true });

const browser = await puppeteer.launch({ headless: true });
try {
  for (const file of files) {
    if (!existsSync(file)) fail(`no such file: ${file}`);
    const page = await browser.newPage();
    await page.goto(pathToFileURL(file).href, { waitUntil: 'networkidle0', timeout: 60000 });

    // A missing artwork would print as a white panel and look like a valid
    // certificate, so refuse rather than produce one.
    const broken = await page.evaluate(() => [...document.images]
      .filter((i) => !i.complete || i.naturalWidth === 0)
      .map((i) => i.getAttribute('src')));
    if (broken.length) fail(`artwork did not load in ${basename(file)}: ${broken.join(', ')}`);

    const out = explicitOut
      ? resolve(repoRoot, explicitOut)
      : resolve(OUT_DIR, basename(file).replace(/\.html$/, '.pdf'));

    await page.pdf({
      path: out,
      preferCSSPageSize: true,   // honour the certificate's own @page size
      printBackground: true,
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
    });
    await page.close();
    const kb = Math.round(readFileSync(out).length / 1024);
    console.log(`  ${relative(repoRoot, out)}  ${kb}K`);
  }
} finally {
  await browser.close();
}
console.log(`\ncertificate-to-pdf: ${files.length} file(s) -> ${relative(repoRoot, OUT_DIR)}/`);
console.log('  nothing was overwritten. Compare against the originals before replacing them.');
