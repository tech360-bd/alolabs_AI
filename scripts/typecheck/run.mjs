import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { cpus, totalmem } from 'node:os';
import { fileURLToPath } from 'node:url';

/**
 * Native build checker.
 *
 * `scripts/typecheck` is a workspace that pins its own TypeScript (7.0.2)
 * because the Next.js config, editor tooling and ESLint keep the root JS
 * compiler. Which copy is installed depends on the package manager:
 *
 *   - bun install        → hoists the workspace's 7.0.2 to the repository root
 *   - npm ci             → installs it in scripts/typecheck/node_modules
 *   - an older lockfile  → only the root 5.9.3 exists
 *
 * The previous version resolved a single hard-coded location, so
 * `typecheck:tests` crashed with MODULE_NOT_FOUND on a clean CI runner while
 * `typecheck` happened to pass. Every candidate is now probed and the chosen
 * compiler is reported, so a genuinely missing compiler fails with an
 * actionable message instead of a stack trace.
 */

const PREFERRED_TYPESCRIPT = '7.0.2';

const CANDIDATES = [
  // Vendored workspace copy (npm ci layout).
  { base: 'scripts/typecheck', label: 'scripts/typecheck' },
  // Hoisted copy (bun install layout) and plain root devDependency.
  { base: '.', label: 'root' },
];

function probe(base) {
  const manifestPath = resolve(base, 'node_modules/typescript/package.json');
  if (!existsSync(manifestPath)) return null;
  const requireFrom = createRequire(resolve(base, 'package.json'));
  try {
    const manifest = requireFrom(manifestPath);
    const tsc = resolve(dirname(manifestPath), manifest.bin.tsc);
    if (!existsSync(tsc)) return null;
    return { manifestPath, manifest, tsc, label: base };
  } catch {
    return null;
  }
}

const found = CANDIDATES.map((c) => probe(c.base)).filter(Boolean);

if (found.length === 0) {
  console.error(
    [
      'No TypeScript compiler found.',
      '',
      'Probed:',
      ...CANDIDATES.map((c) => `  - ${c.base}/node_modules/typescript`),
      '',
      'Install the locked dependency tree first:',
      '  bun install --frozen-lockfile   (or: npm ci)',
    ].join('\n'),
  );
  process.exit(1);
}

// Prefer the pinned checker; fall back to any available compiler and say so.
const chosen = found.find((f) => f.manifest.version === PREFERRED_TYPESCRIPT) ?? found[0];

if (chosen.manifest.version !== PREFERRED_TYPESCRIPT) {
  console.warn(
    `[typecheck] Using TypeScript ${chosen.manifest.version} from ${chosen.label}; ` +
      `the pinned checker is ${PREFERRED_TYPESCRIPT} (scripts/typecheck). ` +
      'Results may differ slightly from CI.',
  );
}

const args = process.argv.slice(2);
const config = args[0] === '--tests' ? (args.shift(), 'tsconfig.tests.json') : 'tsconfig.check.json';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const compilerMajor = Number(chosen.manifest.version.split('.')[0]);

/**
 * TypeScript 7 declares `URLPattern` and friends in its bundled
 * `lib.dom.d.ts`; 5.9.x does not. `src/types/urlpattern.d.ts` is therefore
 * simultaneously:
 *
 *   - required   when checking with 5.9.3, because Next.js's
 *                `server/web/spec-extension/url-pattern.d.ts` references
 *                `URLPatternInput` and would fail with TS2304 without it;
 *   - a duplicate when checking with >= 7, which fails with
 *                `TS2300: Duplicate identifier 'URLPatternInput'`.
 *
 * This is the CI failure that made `npm run typecheck` red: the shim had been
 * excluded to satisfy 7.0.2, and un-excluding it to satisfy 5.9.3 broke 7.0.2
 * again, because both compilers shared the same two configs.
 *
 * A .d.ts cannot detect the compiler from inside itself — declaring the type
 * alias collides regardless of any conditional wrapper — and `skipLibCheck`
 * cannot be relaxed without silencing every declaration file in the repo. So
 * the exclusion is scoped to the compiler actually selected: for >= 7 a
 * derived config is written at the repository root (where the base config's
 * relative `exclude` entries and `types` resolution keep working) that adds
 * the shim to `exclude`. It is removed after the run.
 */
function withShimExcluded(configName) {
  if (compilerMajor < 7) return { configName, cleanup: () => {} };

  const SHIM = 'src/types/urlpattern.d.ts';
  const basePath = resolve(repoRoot, configName);
  const base = JSON.parse(readFileSync(basePath, 'utf8'));
  if (Array.isArray(base.exclude) && base.exclude.includes(SHIM)) {
    return { configName, cleanup: () => {} };
  }

  const derivedPath = resolve(
    repoRoot,
    `.${configName.replace(/\.json$/, '')}.native-typecheck.json`,
  );
  const derived = {
    extends: basePath,
    compilerOptions: {
      ...(base.compilerOptions ?? {}),
      // Never share `.tsbuildinfo` with a different compiler. A cache written
      // by 5.9.3 makes 7.0.2 skip re-checking and silently report success for
      // a program it never verified (observed: 0 errors for a tree that fails
      // on a cold CI runner).
      incremental: true,
      // Keyed by config *and* compiler so the app check, the test check and
      // each compiler never share a cache entry.
      tsBuildInfoFile: `.next/cache/${configName.replace(/\.json$/, '')}-ts${compilerMajor}.tsbuildinfo`,
    },
    exclude: [...(base.exclude ?? ['**/node_modules']), SHIM],
  };
  writeFileSync(derivedPath, `${JSON.stringify(derived, null, 2)}\n`);

  return {
    configName: derivedPath,
    cleanup: () => {
      try {
        rmSync(derivedPath, { force: true });
      } catch {
        /* best effort */
      }
    },
  };
}

mkdirSync(resolve(repoRoot, '.next/cache'), { recursive: true });
const { configName, cleanup } = withShimExcluded(config);

const totalMemMb = Math.floor(totalmem() / (1024 * 1024));
const cpuCount = cpus().length;
const lowMemNative = compilerMajor >= 7 && (totalMemMb <= 4608 || cpuCount <= 2);

/**
 * TypeScript 7 is a native (Go) binary, so NODE_OPTIONS never reaches it; its
 * ceiling comes from the Go runtime. Left alone it is OOM-killed on a 4 GB
 * container (observed: exit 137 with no diagnostics), and multi-goroutine
 * parallel checking + incremental `.tsbuildinfo` serialization thrash GC on
 * <= 4.5 GB / 2-vCPU hosts. On those smaller hosts we run `--singleThreaded`
 * without incremental cache serialization (completes in ~26s cleanly); on >= 8 GB
 * CI runners parallel + incremental remains active.
 *
 * The JavaScript 5.x checker still needs the V8 flag because 250k lines plus
 * the generated catalogues exceed the default 2 GB limit — but not a
 * hard-coded 6144 MB, which aborts on any machine smaller than ~6 GB and
 * surfaces as "exit 1" with no output whatsoever.
 */
const v8HeapMb = Math.min(6144, Math.max(2048, totalMemMb - 1536));
const goMemLimitMb = Math.max(1024, Math.floor(totalMemMb * (lowMemNative ? 0.75 : 0.65)));

const childEnv = {
  ...process.env,
  NODE_OPTIONS: [process.env.NODE_OPTIONS, `--max-old-space-size=${v8HeapMb}`]
    .filter(Boolean)
    .join(' '),
  GOMEMLIMIT: process.env.GOMEMLIMIT ?? `${goMemLimitMb}MiB`,
  GOGC: process.env.GOGC ?? (lowMemNative ? '40' : '50'),
};

const extraCompilerFlags = lowMemNative
  ? ['--singleThreaded', '--incremental', 'false']
  : [];

let result;
try {
  result = spawnSync(
    process.execPath,
    [chosen.tsc, '-p', configName, '--noEmit', ...extraCompilerFlags, ...args],
    {
      stdio: 'inherit',
      env: childEnv,
    },
  );
} finally {
  cleanup();
}

if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
