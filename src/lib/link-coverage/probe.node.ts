import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import type { FileProbe } from './types';

/**
 * Node implementation of `FileProbe`.
 *
 * Server-only: never import this from a client component. It refuses absolute
 * paths and `..` traversal so a registry entry can only ever point inside the
 * repository root.
 *
 * Used by `GET /api/super-admin/link-coverage` and `scripts/verify-link-coverage.ts`.
 */

const MAX_HASH_BYTES = 2 * 1024 * 1024;
const MAX_DIR_FILES = 500;

function isSafeRelative(relativePath: string): boolean {
  if (!relativePath || relativePath.startsWith('/') || relativePath.startsWith('\\')) return false;
  if (/^[a-zA-Z]:/.test(relativePath)) return false;
  return !relativePath.split(/[\\/]/).includes('..');
}

function countLines(buffer: Buffer): number {
  if (buffer.length === 0) return 0;
  let lines = 0;
  for (let i = 0; i < buffer.length; i += 1) {
    if (buffer[i] === 10) lines += 1;
  }
  // A file that does not end in a newline still has a final line.
  if (buffer[buffer.length - 1] !== 10) lines += 1;
  return lines;
}

function walkFiles(absoluteDir: string, budget: { left: number }): string[] {
  const out: string[] = [];
  if (budget.left <= 0) return out;
  let entries: string[];
  try {
    entries = readdirSync(absoluteDir);
  } catch {
    return out;
  }
  for (const name of entries) {
    if (budget.left <= 0) break;
    budget.left -= 1;
    const child = join(absoluteDir, name);
    let stat;
    try {
      stat = statSync(child);
    } catch {
      continue;
    }
    if (stat.isDirectory()) out.push(...walkFiles(child, budget));
    else if (stat.isFile()) out.push(child);
  }
  return out;
}

export function createNodeProbe(root: string, options: { cache?: boolean } = {}): FileProbe {
  const absoluteRoot = resolve(root);
  const memo = new Map<
    string,
    { exists: boolean; isDirectory: boolean; bytes: number; lines: number; sha256Prefix: string | null } | null
  >();

  function probe(relativePath: string) {
    if (!isSafeRelative(relativePath)) {
      return null;
    }
    if (options.cache !== false && memo.has(relativePath)) {
      return memo.get(relativePath) ?? null;
    }

    const absolute = resolve(absoluteRoot, relativePath);
    if (absolute !== absoluteRoot && !absolute.startsWith(absoluteRoot + sep)) {
      memo.set(relativePath, null);
      return null;
    }

    try {
      const stat = statSync(absolute);
      if (stat.isDirectory()) {
        const files = walkFiles(absolute, { left: MAX_DIR_FILES });
        let bytes = 0;
        let lines = 0;
        for (const file of files) {
          try {
            const size = statSync(file).size;
            bytes += size;
            if (size <= MAX_HASH_BYTES) lines += countLines(readFileSync(file));
          } catch {
            // A file that vanished mid-walk is not fatal for a directory summary.
          }
        }
        const result = { exists: true, isDirectory: true, bytes, lines, sha256Prefix: null };
        memo.set(relativePath, result);
        return result;
      }

      const buffer = readFileSync(absolute);
      const result = {
        exists: true,
        isDirectory: false,
        bytes: stat.size,
        lines: countLines(buffer),
        sha256Prefix:
          buffer.length <= MAX_HASH_BYTES ? createHash('sha256').update(buffer).digest('hex').slice(0, 12) : null,
      };
      memo.set(relativePath, result);
      return result;
    } catch {
      memo.set(relativePath, null);
      return null;
    }
  }

  return {
    stat: probe,
    countFiles(relativePath: string) {
      if (!isSafeRelative(relativePath)) return null;
      const absolute = resolve(absoluteRoot, relativePath);
      if (absolute !== absoluteRoot && !absolute.startsWith(absoluteRoot + sep)) return null;
      try {
        if (!statSync(absolute).isDirectory()) return null;
      } catch {
        return null;
      }
      return walkFiles(absolute, { left: 200_000 }).length;
    },
  };
}

/**
 * A working tree is only readable when the registry file itself can be opened.
 * In a Next.js standalone build the source tree is absent, which is exactly the
 * case this guard exists for.
 */
export function isWorkingTreeReadable(root: string): boolean {
  try {
    return statSync(resolve(root, 'src/lib/link-coverage/registry.ts')).isFile();
  } catch {
    return false;
  }
}
