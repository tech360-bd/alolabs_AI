import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { existsSync } from 'node:fs';

/**
 * Native build checker.
 *
 * The `scripts/typecheck` workspace pins its own TypeScript ("$TS_VERSION")
 * because the Next.js config, editor tooling and ESLint keep the root JS
 * compiler. Resolving `typescript` from the repository root therefore picks up
 * the wrong copy on a fresh clone, which used to abort with a misleading
 * "Install the root workspace lock" error.
 *
 * Resolution order:
 *  1. The vendored checker in scripts/typecheck/node_modules (preferred).
 *  2. Whatever `typescript` the active workspace resolves (npm/bun install).
 *
 * Either way the version is verified and the actual binary is reported, so a
 * mismatch is explicit rather than a silent downgrade.
 */

const EXPECTED_TYPESCRIPT = '7.0.2';
const VENDORED_TSC = resolve('scripts/typecheck/node_modules/typescript/package.json');

function resolveCompiler() {
  if (existsSync(VENDORED_TSC)) {
    const requireVendored = createRequire(resolve('scripts/typecheck/package.json'));
    const manifestPath = requireVendored.resolve('typescript/package.json');
    return { manifestPath, manifest: requireVendored(manifestPath) };
  }
  const requireRoot = createRequire(resolve('package.json'));
  const manifestPath = requireRoot.resolve('typescript/package.json');
  return { manifestPath, manifest: requireRoot(manifestPath) };
}

const { manifestPath, manifest } = resolveCompiler();

if (manifest.version !== EXPECTED_TYPESCRIPT) {
  throw new Error(
    `Typecheck requires TypeScript ${EXPECTED_TYPESCRIPT}; found ${manifest.version} at ${manifestPath}. ` +
      'Run `bun install --frozen-lockfile` (or `npm ci`) to restore the pinned checker.',
  );
}

const args = process.argv.slice(2);
const config = args[0] === '--tests' ? (args.shift(), 'tsconfig.tests.json') : 'tsconfig.check.json';

// 250k lines of source plus the generated skill catalogues need more than the
// default V8 heap; without this the checker aborts with "JavaScript heap out of
// memory" on a clean CI runner.
const childEnv = {
  ...process.env,
  NODE_OPTIONS: [process.env.NODE_OPTIONS, '--max-old-space-size=6144'].filter(Boolean).join(' '),
};

const result = spawnSync(
  process.execPath,
  [resolve(dirname(manifestPath), manifest.bin.tsc), '-p', config, '--noEmit', ...args],
  { stdio: 'inherit', env: childEnv },
);

if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
