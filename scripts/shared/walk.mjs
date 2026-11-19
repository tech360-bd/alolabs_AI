import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

export function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) yield* walk(full);
    else yield full;
  }
}
