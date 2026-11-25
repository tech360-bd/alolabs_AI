import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Guards the contract that the test suite runs in a *test* runtime.
 *
 * This is not a style preference. If the shell that starts `npx vitest run`
 * exports `NODE_ENV=production` (a common leftover from a deploy script or a
 * `source .env`), then:
 *
 *   - React resolves `react/cjs/react.production.js`, which does not export
 *     `act`, so every @testing-library/react test dies with
 *     `TypeError: React.act is not a function`;
 *   - Vite's SSR pipeline loads Next.js in production mode, so whole suites
 *     fail at import time with `No such built-in module: node:`;
 *   - `assertProductionDatasource()` refuses SQLite, so every real-database
 *     integration suite aborts in `beforeAll`.
 *
 * On a real machine that looked like 99 failing files / 115 failing tests,
 * none of which indicated a defect in the application. `vitest.config.ts`
 * now pins `NODE_ENV=test` before any module resolves. These assertions keep
 * that pin from being deleted in a future refactor.
 */

const root = process.cwd();

describe('vitest runtime isolation', () => {
  const config = readFileSync(join(root, 'vitest.config.ts'), 'utf8');

  it('pins NODE_ENV=test in the config, before the config exports anything', () => {
    const exportIndex = config.indexOf('export default defineConfig');
    const pinIndex = config.indexOf("process.env.NODE_ENV = 'test'");

    expect(pinIndex).toBeGreaterThan(-1);
    expect(exportIndex).toBeGreaterThan(-1);
    // Must run at module scope and before defineConfig, so it applies to the
    // first resolution Vite performs.
    expect(pinIndex).toBeLessThan(exportIndex);
  });

  it('warns loudly instead of silently repairing an inherited production NODE_ENV', () => {
    expect(config).toMatch(/NODE_ENV=production was inherited/);
    expect(config).toMatch(/console\.warn/);
  });

  it('runs this very suite under NODE_ENV=test', () => {
    // Proves the config-level pin took effect for the running process.
    expect(process.env.NODE_ENV).toBe('test');
  });

  it('resolves the development React build, which is the only one that exports act', async () => {
    const React = await import('react');
    expect(typeof React.act).toBe('function');
  });
});
