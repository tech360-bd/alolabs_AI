import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = process.cwd();
const schema = readFileSync(join(root, 'prisma/schema.prisma'), 'utf8');
const delegates = new Set(
  [...schema.matchAll(/^model\s+(\w+)/gm)].map((match) => {
    const model = match[1];
    return model[0].toLowerCase() + model.slice(1);
  }),
);
const references = new Map<string, Set<string>>();

function walk(directory: string): void {
  for (const name of readdirSync(directory)) {
    const path = join(directory, name);
    const stat = statSync(path);
    if (stat.isDirectory()) walk(path);
    else if (/\.(?:ts|tsx)$/.test(name)) inspect(path);
  }
}

function inspect(path: string): void {
  const source = readFileSync(path, 'utf8');
  // Only inspect modules importing the typed Prisma singleton. Other libraries
  // also use a local variable named `db` for SQLite and are not Prisma delegates.
  if (!/from ['"]@\/lib\/db['"]/.test(source)) return;
  for (const match of source.matchAll(/\bdb\.(\w+)/g)) {
    const delegate = match[1];
    if (!references.has(delegate)) references.set(delegate, new Set());
    references.get(delegate)!.add(relative(root, path));
  }
}

walk(join(root, 'src'));
const unmatched = [...references]
  .filter(([delegate]) => !delegates.has(delegate))
  .sort(([a], [b]) => a.localeCompare(b));

if (unmatched.length) {
  console.error('Unmatched Prisma delegates:');
  for (const [delegate, files] of unmatched) {
    console.error(`- db.${delegate}`);
    for (const file of [...files].sort()) console.error(`    ${file}`);
  }
  process.exit(1);
}

console.log(`Prisma delegate check passed (${references.size} referenced delegates).`);
