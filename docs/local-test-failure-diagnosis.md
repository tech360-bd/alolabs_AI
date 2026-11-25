# Local test failures: diagnosis and fix

**Status: fixed and verified.** Your `npx vitest run` output (99 failed files / 115
failed tests / 1 unhandled error) was **entirely an environment problem**, not an
application defect. No test was rewritten to accommodate it, and no application
code was changed.

- Fix commit: `fe1b2fb` on `arena/5b01e9be-alolabs-ai`
- Pull request: [#57](https://github.com/tech360-bd/alolabs_AI/pull/57) — CI 4/4 green
- Full suite after the fix: **210 files / 2318 tests passing**, exit code 0

---

## What you should run

You do not need to change anything in your shell — the fix works even if
`NODE_ENV=production` is exported. Just pull and re-run:

```bash
cd /home/alamin/alolabs-projects/alolabs_AI
git fetch origin arena/5b01e9be-alolabs-ai
git checkout arena/5b01e9be-alolabs-ai
git pull

npx vitest run
```

If you want to confirm the cause rather than trust it, run this first:

```bash
env | grep -Ei '^(NODE_ENV|PRISMA_SQLITE_ADAPTER|DATABASE_URL|VITEST)'
```

If that prints `NODE_ENV=production`, that single line is the whole story.

To force a clean runtime explicitly (useful while still on an older checkout):

```bash
unset NODE_ENV PRISMA_SQLITE_ADAPTER
export NODE_ENV=test
npx vitest run
```

---

## Root cause

Your shell exported **`NODE_ENV=production`** (and `PRISMA_SQLITE_ADAPTER=1`).
Three independent mechanisms then failed, all of them environmental.

### 1. React's production build has no `act` — ~60 failures

`react/index.js` is a switch:

```js
if (process.env.NODE_ENV === 'production') {
  module.exports = require('./cjs/react.production.js');
} else {
  module.exports = require('./cjs/react.development.js');
}
```

`react.production.js` exports **no `act`** (verified: 0 occurrences of
`exports.act`, versus 1 in `react.development.js`). `@testing-library/react`
16.3.3 calls `React.act`, so every component and hook test died with:

```
TypeError: React.act is not a function
```

The `react-dom-test-utils.production.js` filename in your output was the
signature of this.

### 2. Next.js loads in production mode — the whole-file failures

`No such built-in module: node:` is **Node's own error** for an empty builtin
name (`node -e "require('node:')"` reproduces it verbatim). Under a production
`NODE_ENV`, Vite's SSR pipeline takes a code path that asks Node for a module
specifier that resolves to a bare `node:`. Whole suites failed at **import
time**, which is why the report shows files with no tests at all.

### 3. Prisma's production guard refuses SQLite — the integration suites

`src/lib/db.ts` calls `assertProductionDatasource()` before opening a
connection, and:

```ts
export function isProductionRuntime(env = process.env) {
  return env.NODE_ENV === 'production';
}
```

With `PRISMA_SQLITE_ADAPTER=1` set, that throws:

```
Refusing to start: PRISMA_SQLITE_ADAPTER=1 is set, which forces the SQLite
driver adapter. SQLite is not permitted in production...
```

Every real-database `beforeAll` aborted, and the `afterAll` hooks then threw
`Cannot read properties of undefined (reading 'close')` — a **cascade artefact**,
not a separate bug.

### Reproduction, measured

Running the untouched tree under exactly your environment:

| Environment | Failed files | Failed tests |
|---|---|---|
| clean shell | 0 | 0 |
| `NODE_ENV=production PRISMA_SQLITE_ADAPTER=1` | **98** | **114** |

Your machine reported 99 / 115. The one-file difference is your extra
corrupt-sourcemap unhandled error, which is a separate, machine-local artefact.

---

## The fix

`vitest.config.ts` now pins the runtime at module scope, before `defineConfig`
runs, so it applies to the *first* module resolution rather than relying on the
runner to re-resolve React:

```ts
if (process.env.NODE_ENV !== 'test') {
  if (process.env.NODE_ENV === 'production') {
    console.warn(
      '[vitest] NODE_ENV=production was inherited from the shell; forcing ' +
        'NODE_ENV=test for this run. ...',
    );
  }
  (process.env as Record<string, string | undefined>).NODE_ENV = 'test';
}
```

Two deliberate choices:

- **It warns instead of silently repairing.** A silent override would make the
  next production-mode surprise that much harder to see.
- **It writes through a cast.** `next/types/global.d.ts` declares
  `readonly NODE_ENV`, so the direct assignment failed the TypeScript hard gate
  with `TS2540` — caught by CI on the first push, fixed in the second commit.

`__tests__/unit/vitest-test-runtime.test.ts` locks the invariant in: the pin must
exist, must precede `defineConfig`, must warn, the running process must observe
`NODE_ENV=test`, and `React.act` must be a function.

---

## Verification

Both directions, on the pushed commit:

| Check | Result |
|---|---|
| `npx vitest run`, clean shell | **210 files / 2318 tests pass**, exit 0 |
| `NODE_ENV=production PRISMA_SQLITE_ADAPTER=1 npx vitest run` | **210 files / 2318 tests pass**, exit 0 |
| `eslint vitest.config.ts __tests__/unit/vitest-test-runtime.test.ts` | exit 0 |
| `tsc` on touched files (TypeScript 5.9.3 and 7.0.2) | clean |
| CI on PR #57 | **4/4 green** |

The second row is the meaningful one: the suite is now immune to the shell.

---

## What was *not* wrong

I want to be explicit, because "115 tests were failing" invites unnecessary
changes:

- No application code was modified for this.
- No existing test was edited to accommodate the environment.
- The Prisma production guard was **not** weakened. It is correct: SQLite must
  not be served in production. The bug was the test suite running in a
  production runtime, not the guard.
- `mysql-compatibility` skips are intentional — that suite needs `MYSQL_TEST_URL`.

The one genuinely independent item left is the `convert-source-map` unhandled
error (`Unexpected token '\uFFFD' ... is not valid JSON`). It did not reproduce
here, even under a production `NODE_ENV`, so it is a stale artefact on your
machine rather than a defect in the tree. Clear it with:

```bash
rm -rf node_modules/.vite node_modules/.cache .next/cache
npx vitest run
```

If it survives that, send me the file path from the stack trace and I will
chase it properly.

---

## If anything still fails

Send me these three things and I can be exact rather than speculative:

```bash
env | grep -Ei '^(NODE_ENV|PRISMA_SQLITE_ADAPTER|DATABASE_URL|VITEST)'
which -a bun node
npx vitest run 2>&1 | tail -40
```

`bun` matters: the project declares `packageManager: bun@1.3.4` and
`scripts/install.sh` puts Bun on `PATH`. Running the suite under Bun instead of
Node produces a different class of interop error (`default.resolve is not a
function` in the storage suite is the usual shape).
