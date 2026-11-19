import { openSync, readSync, closeSync, readdirSync, lstatSync, existsSync, realpathSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';

const root = resolve('.next/standalone');
for (const f of ['server.js', '.next/static/chunks', 'public/studio/alo-symbol.webp', 'mini-services/queue-service.cjs', 'mini-services/realtime-service.cjs', 'node_modules/.prisma/client/index.js']) {
  if (!existsSync(join(root, f))) throw Error(`Incomplete standalone package: ${f}`);
}
let count = 0;
const findings = [];
function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const f = join(dir, entry.name), path = relative(root, f);
    if (/^(?:db|storage|uploads|backups|download|audit|\.git)(?:[/\\]|$)/.test(path) || /^(?:\.env(?:$|\.)|.*\.(?:db|sqlite3?)(?:-(?:wal|shm|journal))?$|.*\.(?:key|pfx|p12)$)/i.test(entry.name)) findings.push(path);
    if (entry.isSymbolicLink()) {
      if (!realpathSync(f).startsWith(root + sep)) findings.push(path);
    } else if (entry.isDirectory()) walk(f);
    else if (lstatSync(f).isFile()) {
      count++;
      const fd = openSync(f, 'r'), head = Buffer.alloc(80);
      try { readSync(fd, head, 0, head.length, 0); } finally { closeSync(fd); }
      if (head.subarray(0, 16).toString() === 'SQLite format 3\0' || /^-----BEGIN (?:[A-Z]+ )*PRIVATE KEY-----/.test(head.toString())) findings.push(path);
    }
  }
}
walk(root);
if (findings.length) throw Error(`Local state/private material in standalone package: ${findings.join(', ')}`);
console.log(`Verified standalone entrypoints and ${count} files; no local data or private-key signatures found.`);
