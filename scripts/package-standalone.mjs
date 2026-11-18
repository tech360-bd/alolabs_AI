import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
// No runtime download or generate. All three entrypoints get the same client.
const dist = '.next/standalone';
if (!existsSync(join(dist, 'server.js'))) throw Error('Missing standalone build');
for (const [src, dest] of [['.next/static', '.next/static'], ['public', 'public'], ['node_modules/.prisma', 'node_modules/.prisma'], ['node_modules/@prisma', 'node_modules/@prisma']]) {
  mkdirSync(join(dist, dest), { recursive: true });
  cpSync(src, join(dist, dest), { recursive: true, dereference: true });
}
// Fail closed on traced local state. Only touch the generated distribution.
for (const dir of ['db','storage','uploads','backups','download','audit']) rmSync(join(dist,dir), {recursive:true,force:true});
function scrub(dir) {
  for (const file of readdirSync(dir,{withFileTypes:true})) {
    const path = join(dir,file.name);
    if (/^\.env(?:\.|$)|\.(?:sqlite3?|db)(?:-(?:wal|shm|journal))?$/i.test(file.name)) rmSync(path,{force:true});
    else if (file.isDirectory()) scrub(path);
  }
}
scrub(dist);
