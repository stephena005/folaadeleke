// Reads the fields out of a certificate HTML file.
//
// The certificate is the record. Both the public verify page and the delivery
// email are derived from it, and both used to be fed by hand — which is how a
// stale certificate.json came to claim an edition of 50 that does not exist.
// Parsing the certificate directly removes that transcription step.
//
// Two certificate layouts are in use: the newer split-panel one in
// format-1-split-panel-html/, and the older one in html/ which sets titles in
// capitals and breaks the medium across two lines. Both carry the same fields
// under the same labels, so one set of patterns reads either.
//
// Every field comes back twice:
//   raw   the substring as it appears in the file, entities intact — for
//         writing back into HTML, where re-encoding is a chance to mangle
//         an accent
//   text  decoded to plain text — for anything that is not HTML, or that
//         will be escaped on the way in

import { readFileSync } from 'node:fs';

// The older certificates shout their titles. These are the spellings the site
// uses; an unlisted capitalised title is an error, not something to guess at.
export const CANONICAL_TITLES = new Map([
  ['loud celebration', 'Loud Celebration'],
  ['sisterhood', 'Sisterhood'],
  ['no vc / no vacation', 'No VC / No Vacation'],
  ['we give thanks', 'We Give Thanks'],
  ['loud community', 'Loud Community'],
  ['loud ancestors', 'Loud Ancestors'],
  ['anniversary', 'Anniversary'],
  ['lagbaja', 'Lagbaja'],
  ['elders guidance', 'Elders Guidance'],
  ['sundays best', 'Sundays Best'],
  ['uncles stay lit', 'Uncles Stay Lit'],
  ['tradition imagination', 'Tradition Imagination'],
  ['husband & wife', 'Husband & Wife'],
  ['if you know you know sha', 'If You Know You Know Sha'],
]);

const NAMED_ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', reg: '®', copy: '©',
  middot: '·', times: '×', mdash: '—', ndash: '–', rsquo: '’', lsquo: '‘',
  ldquo: '“', rdquo: '”', eacute: 'é', egrave: 'è', ecirc: 'ê', uuml: 'ü',
  ouml: 'ö', auml: 'ä', ocirc: 'ô', agrave: 'à', aacute: 'á', iacute: 'í', oacute: 'ó',
  uacute: 'ú', ccedil: 'ç', ntilde: 'ñ', oslash: 'ø', aring: 'å', szlig: 'ß', deg: '°',
};

export function decodeEntities(value) {
  return String(value)
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&([a-z]+);/gi, (whole, name) => NAMED_ENTITIES[name.toLowerCase()] ?? whole);
}

export function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function slugify(value) {
  return decodeEntities(value)
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export class CertificateError extends Error {}

function pick(html, pattern, label, file) {
  const found = html.match(pattern);
  if (!found) throw new CertificateError(`could not read ${label} from ${file}`);
  return found[1].replace(/<br\s*\/?>/gi, ' ').replace(/\s+/g, ' ').trim();
}

// Returns { raw, text } for a title, canonicalising the shouted ones.
function readTitle(rawTitle, file) {
  const plain = decodeEntities(rawTitle);
  const canonical = CANONICAL_TITLES.get(plain.toLowerCase());
  if (canonical && canonical !== plain) return { raw: escapeHtml(canonical), text: canonical };
  if (canonical) return { raw: rawTitle, text: plain };
  if (plain === plain.toUpperCase() && /[A-Z]{2}/.test(plain)) {
    throw new CertificateError(
      `${file} titles the work "${plain}" in capitals and it is not in CANONICAL_TITLES.\n`
      + '  Add the spelling the site uses rather than letting a guess reach a public page.');
  }
  return { raw: rawTitle, text: plain };
}

export function readCertificate(file, label = file) {
  const html = readFileSync(file, 'utf8');

  const title = readTitle(pick(html, /class="title">([\s\S]*?)<\/div>/, 'title', label), label);
  const fields = {
    year: pick(html, /class="year">([\s\S]*?)<\/div>/, 'year', label),
    editionNumber: pick(html, /class="edition-num">([\s\S]*?)<\/span>/, 'edition number', label),
    editionTotal: pick(html, /class="edition-total">([\s\S]*?)<\/span>/, 'edition total', label),
    medium: pick(html, /Medium<\/div>\s*<div class="footer-value">([\s\S]*?)<\/div>/, 'medium', label),
    dimensions: pick(html, /Dimensions<\/div>\s*<div class="footer-value">([\s\S]*?)<\/div>/, 'dimensions', label),
    issuedTo: pick(html, /Issued To<\/div>\s*<div class="footer-value">([\s\S]*?)<\/div>/, 'issued to', label),
  };

  const signedBy = pick(html, /class="signed-by">([\s\S]*?)<\/div>/, 'signature line', label);
  const signedDate = signedBy.split('&middot;').pop().split('·').pop().trim();

  const raw = { title: title.raw, signedDate, ...fields };
  const text = { title: title.text, signedDate: decodeEntities(signedDate) };
  for (const [key, value] of Object.entries(fields)) text[key] = decodeEntities(value);

  return {
    file: label,
    raw,
    text,
    // The certificates link the artwork relative to their own directory; the
    // site serves it from the root.
    artSrc: pick(html, /<img class="(?:art-img|artwork-img)" src="([^"]+)"/, 'artwork image', label)
      .replace(/^(\.\.\/)+/, '/'),
    qrPath: pick(html, /<path d="(M2,2H3V3H2z[^"]+)"/, 'QR code', label),
  };
}
