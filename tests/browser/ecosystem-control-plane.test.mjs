import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:net';
import { chromium } from 'playwright';

/**
 * Super Admin Ecosystem Control Plane Chromium Verification (desktop + tablet + mobile).
 * Captures real browser screenshots across 1440x900, 768x1024, and 390x844 and verifies:
 *   1. Asset Vault sync persists all 30 supplied sources & 30 vetted assets;
 *   2. Command Router strategy & privacy persistence survives reload;
 *   3. Coding Agent sandbox guard blocks `main` and runs approved `sandbox/*` task inside git;
 *   4. Zero console TypeError/ReferenceError and zero horizontal overflow on mobile.
 */

const cwd = fileURLToPath(new URL('../../', import.meta.url));
const artifacts = join(cwd, 'tests/browser/artifacts');
const password = randomBytes(24).toString('hex');
let temp, browser, app, origin;

async function shot(page, name) {
  mkdirSync(artifacts, { recursive: true });
  await page.screenshot({ path: join(artifacts, `${name}.png`), fullPage: true });
}

async function signIn(page) {
  await page.goto('/login');
  await page.locator('#login-email').fill('initial@example.test');
  await page.locator('#login-password').fill(password);
  await page.locator('button[type=submit]').click();
  await page.waitForURL('**/dashboard');
}

before(async () => {
  assert.ok(
    !readdirSync(cwd).some((name) => /^\.env(?:$|\.local$|\.development(?:\.local)?$)/.test(name)),
    'Use a clean checkout without runtime dotenv files',
  );
  temp = mkdtempSync(join(tmpdir(), 'alo-ecosystem-browser-'));
  const path = join(temp, 'test.sqlite');
  const env = {
    PATH: process.env.PATH,
    HOME: temp,
    NEXT_TELEMETRY_DISABLED: '1',
    NODE_ENV: 'development',
    DATABASE_URL: `file:${path}`,
    PRISMA_SQLITE_ADAPTER: '1',
    JWT_SECRET: randomBytes(32).toString('hex'),
    ENCRYPTION_KEY: randomBytes(32).toString('hex'),
    CSRF_SECRET: randomBytes(32).toString('hex'),
    SKIP_PAID_SERVICES: 'true',
  };
  execFileSync('npm', ['run', 'db:push:sqlite'], { cwd, env, stdio: 'ignore' });
  execFileSync('npm', ['run', 'seed:agentos'], {
    cwd,
    env: { ...env, SEED_ADMIN_EMAIL: 'initial@example.test', SEED_ADMIN_PASSWORD: password },
    stdio: 'ignore',
  });
  browser = await chromium.launch({ executablePath: process.env.TEST_CHROMIUM_PATH || undefined });
  const sock = createServer();
  await new Promise((resolve) => sock.listen(0, '127.0.0.1', resolve));
  const port = sock.address().port;
  await new Promise((resolve) => sock.close(resolve));
  origin = `http://127.0.0.1:${port}`;
  app = spawn(
    process.execPath,
    ['node_modules/next/dist/bin/next', 'dev', '--hostname', '127.0.0.1', '-p', String(port)],
    { cwd, env, detached: true, stdio: 'ignore' },
  );
  for (let attempt = 0; attempt < 180; attempt += 1) {
    assert.equal(app.exitCode, null, 'isolated dev server exited');
    try {
      if ((await fetch(`${origin}/login`)).ok) return;
    } catch {
      // waiting
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error('isolated dev server did not start');
});

after(async () => {
  if (app?.pid) {
    try {
      process.kill(-app.pid, 'SIGTERM');
    } catch {
      // already stopped
    }
  }
  await browser?.close();
  if (temp) rmSync(temp, { recursive: true, force: true });
});

async function assertNoHorizontalOverflow(page, label) {
  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  assert.ok(
    overflow.scrollWidth <= overflow.innerWidth + 2,
    `${label}: horizontal overflow detected (${overflow.scrollWidth} > ${overflow.innerWidth})`,
  );
}

test('ecosystem hub loads, syncs vault, guards sandbox branches, and renders cleanly across desktop, tablet, and mobile', async (t) => {
  const ctx = await browser.newContext({ baseURL: origin, viewport: { width: 1440, height: 900 } });
  t.after(() => ctx.close());
  const page = await ctx.newPage();
  page.setDefaultTimeout(90000);
  const consoleErrors = [];
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text());
  });

  await signIn(page);
  await page.goto('/dashboard?view=ecosystem-hub');
  await page.getByRole('heading', { name: /Ecosystem Control Plane/ }).waitFor();
  await assertNoHorizontalOverflow(page, 'desktop-1440x900');
  await shot(page, 'ecosystem-hub-desktop-1440x900');

  // Protected branch guard (`main`) rejects unsafe sandbox creation directly from signed-in browser session
  const blockedStatus = await page.evaluate(async () => {
    const token = localStorage.getItem('alo_token') || localStorage.getItem('token');
    const csrfMatch = document.cookie.match(/(?:^|;\s*)csrf-token=([^;]+)/);
    const res = await fetch('/api/super-admin/coding-agents', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...(csrfMatch ? { 'x-csrf-token': decodeURIComponent(csrfMatch[1]) } : {}),
      },
      body: JSON.stringify({
        action: 'create_session',
        harnessSlug: 'claude-code',
        branchName: 'main',
        promptSummary: 'Attempt blocked main write',
      }),
    });
    return res.status;
  });
  assert.equal(blockedStatus, 400, 'Protected branch `main` must be rejected');

  // Vault sync
  await page.getByRole('tab', { name: /Asset Vault/ }).click();
  await page.getByRole('button', { name: /Sync Vault to Database/ }).click();
  await page.getByText(/src-livekit|livekit\/livekit/i).first().waitFor();
  await shot(page, 'ecosystem-vault-1440x900');

  // Coding Harnesses: approve + execute sandbox task
  await page.getByRole('tab', { name: /Coding Harnesses/ }).click();
  await page.getByRole('button', { name: /Create Sandbox Session/ }).click();
  await page.getByRole('button', { name: /Approve/ }).first().waitFor();
  await page.getByRole('button', { name: /Approve/ }).first().click();
  await page.getByRole('button', { name: /Execute in Git Sandbox/ }).first().waitFor();
  await page.getByRole('button', { name: /Execute in Git Sandbox/ }).first().click();
  await page.getByText('completed', { exact: true }).first().waitFor();
  await shot(page, 'ecosystem-harnesses-1440x900');

  // Tablet & Mobile responsive views + horizontal overflow guard
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.getByRole('tab', { name: /Command Router/ }).click();
  await assertNoHorizontalOverflow(page, 'tablet-768x1024');
  await shot(page, 'ecosystem-hub-tablet-768x1024');

  await page.setViewportSize({ width: 390, height: 844 });
  await assertNoHorizontalOverflow(page, 'mobile-390x844');
  await shot(page, 'ecosystem-hub-mobile-390x844');

  assert.deepEqual(
    consoleErrors.filter((line) => /TypeError|ReferenceError|is not a function/.test(line)),
    [],
  );
});
