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

// Each value is optional so the script can be run as the values arrive. The
// worker URL in particular is not knowable until the account subdomain is:
// configure the worker side, deploy, then re-run with --worker-url.
if (!shop && !kv && !workerUrl && !args.secret) {
  fail('need at least one of --shop, --kv, --worker-url, --secret (see worker/README.md)');
}
if (shop && !/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(shop)) {
  fail(`--shop must be the *.myshopify.com admin domain, not the storefront domain (got "${shop}")`);
}
if (kv && !/^[0-9a-f]{32}$/.test(kv)) {
  fail(`--kv must be the 32-character namespace id from "wrangler kv namespace create CLAIMS" (got "${kv}")`);
}
if (workerUrl && !/^https:\/\/[^/\s]+$/.test(workerUrl)) {
  fail(`--worker-url must be an https origin with no path (got "${workerUrl}")`);
}
if (args.secret && !/^[0-9a-f]{32,}$/.test(args.secret)) {
  fail('--secret must be at least 32 hex characters (omit it to reuse or generate one)');
}

const done = [];

// 1. wrangler.toml — KV namespace id and the Shopify admin domain.
const wranglerPath = resolve(workerDir, 'wrangler.toml');
if (kv) {
  edit(wranglerPath, /^id = ".*"$/m, `id = "${kv}"`, 'the KV namespace id');
  done.push(`wrangler.toml     KV namespace id = ${kv}`);
}
if (shop) {
  edit(wranglerPath, /^SHOPIFY_SHOP( *)= ".*"$/m, `SHOPIFY_SHOP$1= "${shop}"`, 'SHOPIFY_SHOP');
  done.push(`wrangler.toml     SHOPIFY_SHOP = ${shop}`);
}

// 2. claim/index.html — the deployed worker endpoint.
if (workerUrl) {
  const claimPath = resolve(repoRoot, 'claim/index.html');
  edit(
    claimPath,
    /var WORKER_ENDPOINT = '.*';/,
    `var WORKER_ENDPOINT = '${workerUrl}/claim';`,
    'WORKER_ENDPOINT',
  );
  done.push(`claim/index.html  WORKER_ENDPOINT = ${workerUrl}/claim`);
}

// 3. welcome-email.html — rendered, never committed.
//
// Only (re)rendered when a secret is explicitly supplied or none exists yet.
// A partial re-run must not silently mint a new secret: that would invalidate
// the CLAIM_SECRET already deployed and break every link in the sent email.
const renderedPath = resolve(repoRoot, RENDERED_EMAIL);
let secret = args.secret;
if (!secret && existsSync(renderedPath)) {
  console.log(`Kept the existing ${RENDERED_EMAIL} and its secret. Pass --secret to re-render.`);
} else {
  secret = secret || randomBytes(16).toString('hex');
  const emailPath = resolve(repoRoot, 'welcome-email.html');
  const template = readFileSync(emailPath, 'utf8');
  if (!template.includes(SECRET_PLACEHOLDER)) {
    fail(
      `${emailPath} no longer contains ${SECRET_PLACEHOLDER}. This repository is ` +
        'public — if a real secret was committed there, rotate CLAIM_SECRET and restore the placeholder.',
    );
  }
  writeFileSync(renderedPath, template.split(SECRET_PLACEHOLDER).join(secret));
  done.push(`${RENDERED_EMAIL}  rendered with CLAIM_SECRET (untracked)`);
}

// 4. Keep the rendered email out of git.
const ignorePath = resolve(repoRoot, '.gitignore');
const ignore = existsSync(ignorePath) ? readFileSync(ignorePath, 'utf8') : '';
if (!ignore.split('\n').includes(RENDERED_EMAIL)) {
  appendFileSync(ignorePath, `${ignore && !ignore.endsWith('\n') ? '\n' : ''}${RENDERED_EMAIL}\n`);
}

console.log(`Configured:\n${done.map((line) => `  ${line}`).join('\n')}`);

const outstanding = [];
if (!kv && /REPLACE_WITH_KV_NAMESPACE_ID/.test(readFileSync(wranglerPath, 'utf8'))) {
  outstanding.push('--kv           npx wrangler kv namespace create CLAIMS');
}
if (!workerUrl && /REPLACE/.test(readFileSync(resolve(repoRoot, 'claim/index.html'), 'utf8'))) {
  outstanding.push('--worker-url   https://<worker>.<your subdomain>.workers.dev');
}
if (outstanding.length) {
  console.log(`\nStill unset — re-run with:\n${outstanding.map((l) => `  ${l}`).join('\n')}`);
}

if (secret) {
  console.log(`
Next:
  cd worker
  npx wrangler secret put CLAIM_SECRET        # paste: ${secret}
  npx wrangler secret put SHOPIFY_ADMIN_TOKEN # shpat_... with write_discounts + read_discounts
  npx wrangler deploy

Then paste ${RENDERED_EMAIL} into beehiiv as the welcome email, send yourself a
test, and confirm the {{email}} merge tag interpolates in the rendered link.`);
}

console.log(`\nCommit wrangler.toml and claim/index.html. Do not commit ${RENDERED_EMAIL}.`);
