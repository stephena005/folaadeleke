#!/usr/bin/env node
// Fills in the deploy-time config for the subscriber discount worker.
//
//   node configure.mjs --shop <name>.myshopify.com \
//                      --kv <kv-namespace-id> \
//                      --worker-url https://<worker>.workers.dev \
//                      [--secret <hex>]
//
// Writes the two non-secret values into tracked files (wrangler.toml,
// claim/index.html) and renders the welcome email to an untracked file with
// CLAIM_SECRET substituted. The secret is never written to a tracked file:
// this repository is public and serves its own root over GitHub Pages, so a
// committed secret would be readable at folaadeleke.com/welcome-email.html.

import { randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync, appendFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const workerDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(workerDir, '..');

const SECRET_PLACEHOLDER = 'REPLACE_WITH_CLAIM_SECRET';
const RENDERED_EMAIL = 'welcome-email.rendered.html';

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    const value = argv[i + 1];
    if (value === undefined || value.startsWith('--')) fail(`--${key} needs a value`);
    out[key] = value;
    i += 1;
  }
  return out;
}

function fail(message) {
  console.error(`configure: ${message}`);
  process.exit(1);
}

function edit(path, pattern, replacement, label) {
  const before = readFileSync(path, 'utf8');
  if (!pattern.test(before)) fail(`could not find ${label} in ${path}`);
  const after = before.replace(pattern, replacement);
  writeFileSync(path, after);
  return before !== after;
}

const args = parseArgs(process.argv.slice(2));

const shop = args.shop;
const kv = args.kv;
const workerUrl = args['worker-url'];
const secret = args.secret || randomBytes(16).toString('hex');

if (!shop || !kv || !workerUrl) {
  fail('need --shop, --kv and --worker-url (see worker/README.md)');
}
if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(shop)) {
  fail(`--shop must be the *.myshopify.com admin domain, not the storefront domain (got "${shop}")`);
}
if (!/^[0-9a-f]{32}$/.test(kv)) {
  fail(`--kv must be the 32-character namespace id from "wrangler kv namespace create CLAIMS" (got "${kv}")`);
}
if (!/^https:\/\/[^/\s]+$/.test(workerUrl)) {
  fail(`--worker-url must be an https origin with no path (got "${workerUrl}")`);
}
if (!/^[0-9a-f]{32,}$/.test(secret)) {
  fail('--secret must be at least 32 hex characters (omit it to generate one)');
}

// 1. wrangler.toml — KV namespace id and the Shopify admin domain.
const wranglerPath = resolve(workerDir, 'wrangler.toml');
edit(wranglerPath, /^id = ".*"$/m, `id = "${kv}"`, 'the KV namespace id');
edit(wranglerPath, /^SHOPIFY_SHOP( *)= ".*"$/m, `SHOPIFY_SHOP$1= "${shop}"`, 'SHOPIFY_SHOP');

// 2. claim/index.html — the deployed worker endpoint.
const claimPath = resolve(repoRoot, 'claim/index.html');
edit(
  claimPath,
  /var WORKER_ENDPOINT = '.*';/,
  `var WORKER_ENDPOINT = '${workerUrl}/claim';`,
  'WORKER_ENDPOINT',
);

// 3. welcome-email.html — rendered, never committed.
const emailPath = resolve(repoRoot, 'welcome-email.html');
const template = readFileSync(emailPath, 'utf8');
if (!template.includes(SECRET_PLACEHOLDER)) {
  fail(
    `${emailPath} no longer contains ${SECRET_PLACEHOLDER}. This repository is ` +
      'public — if a real secret was committed there, rotate CLAIM_SECRET and restore the placeholder.',
  );
}
const renderedPath = resolve(repoRoot, RENDERED_EMAIL);
writeFileSync(renderedPath, template.split(SECRET_PLACEHOLDER).join(secret));

// 4. Keep the rendered email out of git.
const ignorePath = resolve(repoRoot, '.gitignore');
const ignore = existsSync(ignorePath) ? readFileSync(ignorePath, 'utf8') : '';
if (!ignore.split('\n').includes(RENDERED_EMAIL)) {
  appendFileSync(ignorePath, `${ignore && !ignore.endsWith('\n') ? '\n' : ''}${RENDERED_EMAIL}\n`);
}

console.log(`Configured:
  wrangler.toml     KV id + SHOPIFY_SHOP = ${shop}
  claim/index.html  WORKER_ENDPOINT = ${workerUrl}/claim
  ${RENDERED_EMAIL}  rendered with CLAIM_SECRET (untracked)

Next:
  cd worker
  npx wrangler secret put CLAIM_SECRET        # paste: ${secret}
  npx wrangler secret put SHOPIFY_ADMIN_TOKEN # shpat_... with write_discounts + read_discounts
  npx wrangler deploy

Then paste ${RENDERED_EMAIL} into beehiiv as the welcome email, send yourself a
test, and confirm the {{email}} merge tag interpolates in the rendered link.

Commit wrangler.toml and claim/index.html. Do not commit ${RENDERED_EMAIL}.`);
