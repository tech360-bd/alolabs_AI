#!/usr/bin/env npx tsx
/**
 * Read-only workforce verification (replaces the former hardcoded report).
 *
 * Verifies the live database against the deterministic plan: 100 departments,
 * 2,000 primary agents, tenant and department ownership, drift, orphans and
 * required configuration. It does NOT claim agents are operational — that
 * requires execution evidence and is reported as `agentsOperational`.
 *
 * Equivalent to: npx tsx scripts/provision-workforce.ts --verify
 */
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

// Run the TypeScript CLI through tsx (plain node cannot execute .ts files).
const tsxCli = require.resolve('tsx/cli');
const result = spawnSync(process.execPath, [tsxCli, join(__dirname, 'provision-workforce.ts'), '--verify'], {
  stdio: 'inherit',
  env: process.env,
});
process.exit(result.status ?? 2);
