// Called by snapshot.py, after the file and route indices exist. No imports from
// the application are executed. Results are candidates, not a liveness proof.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire, isBuiltin } from 'node:module';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const out = process.argv[2];
const lines = name => fs.readFileSync(path.join(out, name), 'utf8').trimEnd().split('\n').slice(1).map(s => s.split('\t'));
const save = (name, obj) => fs.writeFileSync(path.join(out, name), JSON.stringify(obj, null, 2) + '\n');
const manifest = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const config = ts.parseJsonConfigFileContent(ts.readConfigFile('tsconfig.json', ts.sys.readFile).config, ts.sys, process.cwd()).options;
const cache = ts.createModuleResolutionCache(process.cwd(), s => s, config);
const seen = new Set(), appSources = [], missingLocal = [], missingPackage = [], apiCandidates = [];
let refs = 0, apiCalls = 0;
const appRoutes = lines('routes.tsv').filter(([, , role]) => role === 'route').map(([, url]) => {
  const pattern = url.split('/').map(s => s.startsWith('[...') ? '.+' : s.startsWith('[') ? '[^/]+' : s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return new RegExp('^' + pattern.join('/') + '/?$');
});
function specifier(file, scope, s) {
  refs++;
  if (isBuiltin(s)) return;
  const local = s.startsWith('.') || s.startsWith('@/');
  const resolved = ts.resolveModuleName(s, path.resolve(file), config, ts.sys, cache).resolvedModule;
  if (local) {
    if (resolved) seen.add(path.relative(process.cwd(), resolved.resolvedFileName));
    else {
      const p = s.startsWith('@/') ? path.resolve('src', s.slice(2)) : path.resolve(path.dirname(file), s);
      if (!fs.existsSync(p)) missingLocal.push([scope, file, s]);
    }
  } else {
    if (scope === 'root') seen.add(s.startsWith('@') ? s.split('/').slice(0, 2).join('/') : s.split('/')[0]);
    if (!resolved) {
      try { require.resolve(s, { paths: [path.dirname(path.resolve(file))] }); }
      catch { missingPackage.push([scope, file, s]); }
    }
  }
}
for (const [file] of lines('files.tsv')) {
  if (!/\.(tsx?|[cm]?jsx?)$/.test(file) || file.startsWith('ai-skills/')) continue;
  const scope = file.startsWith('mini-services/') ? file.split('/').slice(0, 2).join('/') :
    file.startsWith('audit/alo-labs/') ? 'audit/alo-labs' : file.startsWith('examples/') ? 'examples' : 'root';
  const sf = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
  if (scope === 'root' && file.startsWith('src/')) appSources.push(file);
  const appFile = file.startsWith('src/') && !file.includes('__tests__') && !file.endsWith('.generated.ts') && /\.tsx?$/.test(file);
  function visit(n) {
    if ((ts.isImportDeclaration(n) || ts.isExportDeclaration(n)) && n.moduleSpecifier && ts.isStringLiteral(n.moduleSpecifier)) {
      specifier(file, scope, n.moduleSpecifier.text);
    } else if (ts.isCallExpression(n) && n.arguments[0]) {
      const call = n.expression.getText(sf), arg = n.arguments[0];
      if ((n.expression.kind === ts.SyntaxKind.ImportKeyword || call === 'require') && ts.isStringLiteral(arg)) specifier(file, scope, arg.text);
      if (appFile && /^(?:fetch|apiFetch|fetchJson|api\.(?:get|post|patch|delete|put))$/.test(call)) {
        const s = ts.isStringLiteralLike(arg) ? arg.text : ts.isTemplateExpression(arg) ? arg.head.text + arg.templateSpans.map(sp => 'DYNAMIC' + sp.literal.text).join('') : '';
        const url = s.split(/[?#]/)[0];
        if (url.startsWith('/api/')) {
          apiCalls++;
          if (!appRoutes.some(r => r.test(url))) apiCandidates.push([file, 1 + sf.getLineAndCharacterOfPosition(arg.getStart()).line, url]);
        }
      }
    }
    ts.forEachChild(n, visit);
  }
  visit(sf);
}
save('module-check.json', {
  scope: 'literal import/export/require/dynamic import in git-listed JS/TS excluding ai-skills; root and audit/alo-labs locks installed',
  refs, unresolvedLocal: missingLocal, unresolvedPackage: missingPackage,
  noDirectInboundSource: appSources.filter(f => !f.startsWith('src/app/') && !f.includes('__tests__') && !seen.has(f)),
  notImportedRootManifest: [...Object.keys(manifest.dependencies), ...Object.keys(manifest.devDependencies)].filter(k => !seen.has(k)),
  apiCallsExamined: apiCalls, apiReferenceCandidates: apiCandidates.length,
});
fs.writeFileSync(path.join(out, 'api-reference-candidates.tsv'), ['source\tline\trequest path pattern', ...apiCandidates.map(r => r.join('\t'))].join('\n') + '\n');
