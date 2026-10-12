#!/usr/bin/env node
/** Real HTTP ACL verification against an isolated database/server. No mocks. */
import fs from 'node:fs/promises';

const base = process.env.ACL_TEST_BASE_URL;
const credentialFile = process.env.ACL_TEST_CREDENTIAL_FILE;
if (!base || !credentialFile || !/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(base)) {
  console.error('Set ACL_TEST_BASE_URL to a loopback isolated server and ACL_TEST_CREDENTIAL_FILE to a protected fixture file.');
  process.exit(2);
}
const credentials = JSON.parse(await fs.readFile(credentialFile, 'utf8'));
const checks = [];
async function request(method, route, token, body) {
  const response = await fetch(base + route, {
    method,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(typeof body === 'string' ? { 'Content-Type': 'application/json' } : {}) },
    ...(body !== undefined ? { body } : {}),
  });
  return response;
}
function record(name, actual, expected, condition = true) {
  const ok = actual === expected && condition;
  checks.push({ name, expected, actual, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}: HTTP ${actual} (expected ${expected})`);
}
const tokens = {};
for (const label of ['a', 'b']) {
  const response = await request('POST', '/api/auth/login', null, JSON.stringify({
    email: credentials[label].email, password: credentials[label].password,
  }));
  const result = await response.json();
  record(`${label} real login`, response.status, 200, Boolean(result.token));
  tokens[label] = result.token;
}
if (!tokens.a || !tokens.b) process.exit(1);
const files = {};
for (const label of ['a', 'b']) {
  const form = new FormData();
  form.set('folder', 'acltests');
  form.set('file', new Blob([`tenant-${label}-only`], { type: 'text/plain' }), `${label}-private.txt`);
  const response = await request('POST', '/api/storage/files', tokens[label], form);
  const result = await response.json();
  record(`${label} upload with persisted membership`, response.status, 201,
    result.file?.companyId === credentials[label].companyId && result.file?.uploadedBy === credentials[label].userId);
  files[label] = result.file?.id;
}
if (!files.a || !files.b) process.exit(1);
const bKey = encodeURIComponent(files.b);
let response = await request('GET', `/api/storage/files/${bKey}`);
record('unauthenticated B file denied', response.status, 401);
response = await request('GET', `/api/storage/files/${bKey}`, tokens.a);
record('A cannot download B file', response.status, 404);
response = await request('GET', `/api/storage/files/${bKey}`, tokens.b);
record('B can download own file', response.status, 200, (await response.text()) === 'tenant-b-only');
response = await request('GET', '/api/storage/files?folder=acltests', tokens.a);
const list = await response.json();
record('A cannot list B file', response.status, 200,
  list.files?.some((file) => file.id === files.a) && !list.files?.some((file) => file.id === files.b));
response = await request('GET', `/api/artifacts/${credentials.b.artifactId}`, tokens.a);
record('A cannot retrieve B artifact', response.status, 403);
response = await request('DELETE', '/api/storage/files', tokens.a, JSON.stringify({ key: files.b }));
record('A cannot delete B file', response.status, 404);
response = await request('GET', `/api/storage/files/${bKey}`, tokens.b);
record('B file remains accessible after denial', response.status, 200, (await response.text()) === 'tenant-b-only');
console.log(`ACL checks passed: ${checks.filter((x) => x.ok).length}/${checks.length}; credentials and tokens withheld.`);
if (checks.some((x) => !x.ok)) process.exitCode = 1;
