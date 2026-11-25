import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:net';
import { DatabaseSync } from 'node:sqlite';
import { chromium } from 'playwright';

/**
 * Commanding Center browser regression (Phase C2 + D tier 1).
 *
 * This is real Chromium against a real `next dev` server on a disposable
 * SQLite database. It proves, end where the operator ends:
 *
 *   1. research evidence is measured, rendered, saved and recovered after reload;
 *   2. a prohibited destination is refused and the message is shown;
 *   3. a command turn that fails still creates a run, the stream ends in an
 *      error frame (never a fabricated final), and the stored timeline is
 *      retrievable through the API afterwards.
 *
 * No AI provider is configured in this database, so the command run is expected
 * to fail — that is the point. Nothing here needs a paid key or the network
 * except the public example.com page used for the research step.
 */

const cwd = fileURLToPath(new URL('../../', import.meta.url));
const artifacts = join(cwd, 'tests/browser/artifacts');
const password = randomBytes(24).toString('hex');
let temp, db, browser, app, origin;

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

async function openResearch(page) {
  await page.goto('/dashboard?view=command-agent');
  await page.getByRole('heading', { name: /Commanding Center/ }).waitFor();
  await page.getByRole('tab', { name: /Research & Verify/ }).click();
  await page.getByLabel('Public page URL').waitFor();
}

before(async () => {
  assert.ok(
    !readdirSync(cwd).some((name) => /^\.env(?:$|\.local$|\.development(?:\.local)?$)/.test(name)),
    'Use a clean checkout without runtime dotenv files',
  );
  temp = mkdtempSync(join(tmpdir(), 'alo-command-center-'));
  const path = join(temp, 'test.sqlite');
  const env = {
    PATH: process.env.PATH,
    HOME: temp,
    NEXT_TELEMETRY_DISABLED: '1',
    NODE_ENV: 'development',
    DATABASE_URL: `file:${path}`,
    PRISMA_SQLITE_ADAPTER: '1',
    JWT_SECRET: randomBytes(32).toString('hex'),
  };
  execFileSync('npm', ['run', 'db:push:sqlite'], { cwd, env, stdio: 'ignore' });
  execFileSync('npm', ['run', 'seed:agentos'], {
    cwd,
    env: { ...env, SEED_ADMIN_EMAIL: 'initial@example.test', SEED_ADMIN_PASSWORD: password },
    stdio: 'ignore',
  });
  db = new DatabaseSync(path);
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
      // server not listening yet
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
      // already gone
    }
  }
  await browser?.close();
  db?.close();
  if (temp) rmSync(temp, { recursive: true, force: true });
});

test('research evidence is measured, saved, and recovered after reload', async (t) => {
  const ctx = await browser.newContext({ baseURL: origin });
  t.after(() => ctx.close());
  const page = await ctx.newPage();
  page.setDefaultTimeout(90000);
  const consoleErrors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });

  await signIn(page);
  await openResearch(page);
  await page.getByLabel('Public page URL').fill('https://example.com/');
  const saveToggle = page.getByLabel(/Save to tenant memory/);
  if (!(await saveToggle.isChecked())) await saveToggle.check();
  await page.getByRole('button', { name: /^Analyse$/ }).click();

  await page.getByText('Evidence', { exact: true }).first().waitFor();
  const evidence = await page.getByText(/HTTP 200 · public/).first().textContent();
  assert.match(String(evidence), /HTTP 200 · public/);

  const shaRow = await page.getByText(/^[a-f0-9]{64}$/).first().textContent();
  assert.match(String(shaRow), /^[a-f0-9]{64}$/);
  await page.getByText(/Verification level:/).waitFor();
  assert.match(String(await page.getByText(/Verification level:/).textContent()), /http_fetch/);
  await page.getByText(/Saved to this company only/).waitFor();
  await shot(page, 'research-evidence');

  // The saved finding is company-scoped and readable through the API.
  const saved = await ctx.request.get('/api/research/analyze');
  assert.equal(saved.status(), 200);
  const savedJson = await saved.json();
  assert.ok(Array.isArray(savedJson.reports) && savedJson.reports.length >= 1);
  const report = savedJson.reports.find((entry) => String(entry.finalUrl).includes('example.com'));
  assert.ok(report, 'saved report is listed for this company');
  assert.equal(report.sha256.length, 64);

  // Reload: the stored finding must still be there (persistence, not state).
  await page.reload();
  await page.getByRole('tab', { name: /Research & Verify/ }).click();
  await page.getByText(/example\.com/).first().waitFor();
  // Hydration/dev-server warnings are not defects; runtime exceptions are.
  assert.deepEqual(
    consoleErrors.filter((line) => /TypeError|ReferenceError|is not a function/.test(line)),
    [],
  );
});

test('a prohibited destination is refused with an explanation', async (t) => {
  const ctx = await browser.newContext({ baseURL: origin });
  t.after(() => ctx.close());
  const page = await ctx.newPage();
  page.setDefaultTimeout(60000);

  await signIn(page);
  await openResearch(page);
  await page.getByLabel('Public page URL').fill('http://127.0.0.1:9/admin');
  await page.getByRole('button', { name: /^Analyse$/ }).click();
  await page.getByText(/Analysis failed/).waitFor();
  await page.getByText(/only ports 80 and 443/).waitFor();
  await shot(page, 'research-prohibited-url');
});

test('a failed command run is streamed honestly and its timeline is retrievable', async (t) => {
  const ctx = await browser.newContext({ baseURL: origin });
  t.after(() => ctx.close());
  const page = await ctx.newPage();
  page.setDefaultTimeout(90000);

  await signIn(page);
  await page.goto('/dashboard?view=command-agent');
  await page.getByRole('heading', { name: /Commanding Center/ }).waitFor();

  // No free provider is authorised in this database, so the run must fail.
  const streamed = page.waitForResponse(
    (response) => response.url().includes('/api/command-agent/stream') && response.request().method() === 'POST',
  );
  await page.getByPlaceholder(/Command your agent/).fill('browser timeline verification');
  await page.getByRole('button', { name: /^Command$/ }).click();
  const response = await streamed;
  assert.equal(response.status(), 200);

  const body = await response.text();
  const frames = body.split('\n').filter(Boolean).map((line) => JSON.parse(line));
  const runFrame = frames.find((frame) => frame.type === 'run');
  assert.ok(runFrame?.runId, 'the stream announces the persisted run id');
  assert.equal(frames.some((frame) => frame.type === 'final'), false, 'a failed run has no final frame');
  assert.equal(frames.filter((frame) => frame.type === 'error').length, 1);

  const fetched = await ctx.request.get(`/api/command-agent/runs/${encodeURIComponent(runFrame.runId)}`);
  assert.equal(fetched.status(), 200);
  const stored = await fetched.json();
  assert.equal(stored.run.status, 'failed');
  const eventTypes = stored.run.events.map((event) => event.type);
  assert.ok(eventTypes.includes('run_started'));
  assert.ok(eventTypes.includes('error'));
  await shot(page, 'command-run-failure');
});
