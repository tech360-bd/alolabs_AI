// Read-only, run from the repo root with the root lock installed. This checks
// names, wiring and *candidate* clones, not behavioral or type equivalence.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const base = '4def42076c6e829cb5731f9f234be0e119fbff9c';
const audit = fileURLToPath(new URL('../', import.meta.url));
const git = (...args) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const paths = (...args) => git(...args).split('\0').filter(Boolean);
const tsv = p => readFileSync(join(audit, p), 'utf8').trimEnd().split('\n').slice(1).map(line => line.split('\t'));
const inventory = tsv('after/files.tsv');
const moves = tsv('preservation/extractions.tsv');
const code = p => /\.(?:[mc]?[jt]s|[jt]sx)$/.test(p) && !p.endsWith('.d.ts') && !/^(?:ai-skills|docs\/audit)\//.test(p);
const isTest = p => p.includes('__tests__/') || p.includes('.test.');
const httpMethod = /^(?:GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)$/;
const parse = (p, text) => ts.createSourceFile(p, text, ts.ScriptTarget.Latest, true);
const marked = (n, kind) => (n.modifiers ?? []).some(m => m.kind === kind);
const trackedChanges = new Set(paths('diff', '--no-renames', '--name-only', '-z', base));
const present = [...new Set(paths('ls-files', '-co', '-z', '--exclude-standard'))].filter(existsSync);
const missingFiles = inventory.map(([p]) => p).filter(p => !existsSync(p));
const baseDeletedPaths = paths('diff', '--no-renames', '--diff-filter=D', '--name-only', '-z', base);

// Syntactic exports include named re-exports and exported types. A wildcard is
// compared as a wildcard, not expanded; package consumers are not modeled.
function surface(sf) {
  const names = new Set(), methods = new Set();
  for (const n of sf.statements) {
    if (ts.isExportDeclaration(n)) {
      if (n.exportClause && ts.isNamedExports(n.exportClause)) for (const e of n.exportClause.elements) names.add(e.name.text);
      else names.add(n.exportClause?.name.text ?? `* from ${n.moduleSpecifier?.text}`);
    } else if (ts.isExportAssignment(n)) names.add(n.isExportEquals ? 'export=' : 'default');
    else if (marked(n, ts.SyntaxKind.ExportKeyword)) {
      const name = marked(n, ts.SyntaxKind.DefaultKeyword) ? 'default' : n.name?.getText(sf);
      if (name) names.add(name);
      if (ts.isVariableStatement(n)) for (const v of n.declarationList.declarations) names.add(v.name.getText(sf));
      if (ts.isClassDeclaration(n)) for (const m of n.members) {
        if (!ts.isMethodDeclaration(m) && !ts.isGetAccessorDeclaration(m) && !ts.isSetAccessorDeclaration(m)) continue;
        if (marked(m, ts.SyntaxKind.PrivateKeyword) || marked(m, ts.SyntaxKind.ProtectedKeyword) || ts.isPrivateIdentifier(m.name)) continue;
        methods.add(`${name}${marked(m, ts.SyntaxKind.StaticKeyword) ? '.' : '#'}${m.name.getText(sf)}`);
      }
    }
  }
  return { names, methods };
}

const printer = ts.createPrinter({ removeComments: true });
const print = (node, sf) => printer.printNode(ts.EmitHint.Unspecified, node, sf);
const bodies = new Map(), missingNames = [], missingMethods = [], missingRouteMethods = [];
let compared = 0, exportsCompared = 0, methodsCompared = 0, routes = 0, routeMethods = 0, cloneFiles = 0;
for (const p of [...new Set([...present, ...baseDeletedPaths])].filter(code)) {
  const sf = parse(p, existsSync(p) ? readFileSync(p, 'utf8') : '');
  const current = surface(sf);
  const route = /^src\/app\/api\/(?:.*\/)?route\.[tj]sx?$/.test(p);
  if (route && existsSync(p)) { routes++; routeMethods += [...current.names].filter(n => httpMethod.test(n)).length; }
  if (trackedChanges.has(p)) {
    // A changed path may be a newly staged addition with no blob at base.
    const previous = paths('ls-tree', '--name-only', '-z', base, '--', `:(literal)${p}`);
    if (previous.length) {
      compared++;
      const original = surface(parse(p, git('show', `${base}:${p}`)));
      exportsCompared += original.names.size;
      methodsCompared += original.methods.size;
      for (const n of original.names) if (!current.names.has(n)) {
        missingNames.push(`${p}#${n}`);
        if (route && httpMethod.test(n)) missingRouteMethods.push(`${p}#${n}`);
      }
      for (const n of original.methods) if (!current.methods.has(n)) missingMethods.push(`${p}:${n}`);
    }
  }
  if (isTest(p) || p.endsWith('.generated.ts') || !existsSync(p)) continue;
  cloneFiles++;
  for (const n of sf.statements) {
    if (!ts.isFunctionDeclaration(n) || !n.body || !n.name) continue;
    const body = print(n.body, sf);
    if (body.length <= 64) continue;
    const params = n.parameters.map(p => print(p, sf)).join(',');
    const hash = createHash('sha256').update(params + '\0' + body).digest('hex');
    const group = bodies.get(hash) ?? [];
    group.push(`${p}#${n.name.text}`);
    bodies.set(hash, group);
  }
}

// A moved helper must exist at its destination and have a binding at its
// former consumer. In the JS/TS seed wrappers the outer writer is forwarded
// as a unit; the ID and escaping helpers stay private inside that writer.
const cache = new Map(), missingBindings = [];
function moduleInfo(p) {
  if (cache.has(p)) return cache.get(p);
  const sf = parse(p, readFileSync(p, 'utf8'));
  const fns = new Set(), bindings = new Set();
  const add = (spec, name, alias) => {
    if (typeof spec !== 'string') return;
    const file = spec.startsWith('@/') ? join('src', spec.slice(2)) : normalize(join(dirname(p), spec));
    bindings.add(`${file.replace(/\.[mc]?[jt]sx?$/, '')}#${name}:${alias}`);
  };
  for (const n of sf.statements) {
    if (ts.isFunctionDeclaration(n) && n.body && n.name) fns.add(n.name.text);
    if (ts.isImportDeclaration(n) || ts.isExportDeclaration(n)) {
      const list = ts.isImportDeclaration(n) ? n.importClause?.namedBindings : n.exportClause;
      for (const e of list?.elements ?? []) add(n.moduleSpecifier?.text, (e.propertyName ?? e.name).text, e.name.text);
    }
    if (ts.isVariableStatement(n)) for (const v of n.declarationList.declarations) {
      const init = v.initializer;
      if (ts.isObjectBindingPattern(v.name) && init && ts.isCallExpression(init) && init.expression.getText(sf) === 'require') {
        for (const e of v.name.elements) add(init.arguments[0]?.text, (e.propertyName ?? e.name).getText(sf), e.name.getText(sf));
      }
    }
  }
  const info = { fns, bindings }; cache.set(p, info); return info;
}
for (const [, from, to, via] of moves) {
  const [p, local] = from.split('#'), [dest, name] = to.split('#');
  const forward = via !== '-';
  const expected = `${dest.replace(/\.[mc]?[jt]sx?$/, '')}#${forward ? via : name}:${forward ? via : local}`;
  if (!moduleInfo(dest).fns.has(name) || (from !== to && !moduleInfo(p).bindings.has(expected))) missingBindings.push({ from, to, via });
}
const detected = moves.filter(([group]) => /^\d+$/.test(group));
const report = {
  base, priorFilesChecked: inventory.length, missingFiles, baseDeletedPaths,
  changedBaseCodeFilesCompared: compared, explicitExportNamesCompared: exportsCompared, publicClassMethodsCompared: methodsCompared,
  missingNames, missingMethods, apiRouteFiles: routes, explicitlyNamedApiMethods: routeMethods, missingRouteMethods,
  originalCloneGroups: new Set(detected.map(([g]) => g)).size, originalCloneDefinitions: detected.length,
  canonicalTargetsForThoseGroups: new Set(detected.map(([, , dest]) => dest)).size,
  mappedRowsIncludingAdjacentHelpers: moves.length, missingBindings, cloneFiles,
  remainingCandidateGroups: [...bodies.values()].filter(rows => rows.length > 1),
};
console.log(JSON.stringify(report, null, 2));
if ([missingFiles, missingNames, missingMethods, missingBindings].some(list => list.length)) process.exitCode = 1;
