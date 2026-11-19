// Bundle both first-party services beside the standalone app. Database and
// native addons resolve from its node_modules, including its generated client.
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = fileURLToPath(new URL('..', import.meta.url));
await build({
  absWorkingDir: root,
  entryPoints: { 'queue-service': 'mini-services/queue-service/index.ts', 'realtime-service': 'mini-services/realtime-service/index.ts' },
  outdir: process.env.MINI_SERVICES_OUT_DIR || path.join(root, '.next/standalone/mini-services'),
  outExtension: { '.js': '.cjs' }, platform: 'node', target: 'node22', format: 'cjs',
  bundle: true, logLevel: 'info', external: ['@prisma/*', 'better-sqlite3', 'bcrypt', 'bufferutil', 'utf-8-validate'],
});
