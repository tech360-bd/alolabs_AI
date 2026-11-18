#!/usr/bin/env python3
"""Rebuild the after-inventory from the repository root into a new external directory.

Usage: python3 docs/audit/integration-2026-11-18/tools/snapshot.py /tmp/alo-snapshot
The JS pass uses the installed root TypeScript and root/nested package trees. No
archives are extracted, application code executed, or environment values read.
"""
import argparse
from collections import Counter, defaultdict
import csv
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import tarfile
from urllib.parse import unquote
import zipfile


def command(*args):
    return subprocess.check_output(args)


root = Path(os.fsdecode(command('git', 'rev-parse', '--show-toplevel')).strip()).resolve()
os.chdir(root)
report_dir = Path(__file__).resolve().parents[1].relative_to(root)
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('output', type=Path)
out = parser.parse_args().output.resolve()
if out == root or root in out.parents or (out.exists() and any(out.iterdir())):
    parser.error('Choose a new or empty directory outside the checkout.')
out.mkdir(parents=True, exist_ok=True)


# Include the pre-change evidence, but not the self-referential after-report.
excluded = {report_dir / 'after', report_dir / 'tools', report_dir / '02-after.md'}


def paths(*args):
    return {p for b in command('git', 'ls-files', '-z', *args).split(b'\0') if b
            for p in [Path(os.fsdecode(b))] if not any(p == x or x in p.parents for x in excluded)}


def empty_directories():
    """Git lists files, not empty dirs. Walk dirs separately; prune ignored trees before descent."""
    frontier, empty = [Path('.')], []
    while frontier:
        children = []
        for folder in frontier:
            entries = list(folder.iterdir())
            if not entries and folder != Path('.'):
                empty.append(str(folder))
            children.extend(p for p in entries if p.name != '.git' and p not in excluded
                            and not p.is_symlink() and p.is_dir())
        if not children:
            break
        check = subprocess.run(['git', 'check-ignore', '-z', '--stdin'],
                               input=b''.join(os.fsencode(p) + b'/\0' for p in children), stdout=subprocess.PIPE)
        if check.returncode not in (0, 1):
            check.check_returncode()
        ignored = {Path(os.fsdecode(p)) for p in check.stdout.split(b'\0') if p}
        frontier = [p for p in children if p not in ignored]
    return sorted(empty)


def tsv(name, header, rows):
    with (out / (name + '.tsv')).open('w', newline='') as f:
        w = csv.writer(f, delimiter='\t', lineterminator='\n')
        w.writerow(header)
        w.writerows(rows)


def digest(data):
    return hashlib.sha256(data).hexdigest()


tracked = paths()
indexed = sorted(tracked | paths('-o', '--exclude-standard'))
present = [p for p in indexed if p.is_file() and not p.is_symlink()]
parents = {d for p in present for d in p.parents if d != Path('.')}
files, texts, sizes = {}, {}, {}
by_hash, names = defaultdict(list), defaultdict(set)
counts, archive_counts = Counter(), Counter()
routes, urls, shell, models = [], set(), [], {}
markers, links, assets, archive_rows, non_json, shell_errors = [], [], [], [], [], []
text_ext = {'.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.css', '.md', '.sh', '.yml', '.yaml', '.sql', '.prisma', '.json', '.py'}
for p in present:
    b = p.read_bytes()
    files[p] = digest(b)
    sizes[p] = len(b)
    by_hash[files[p]].append(p)
    if p.suffix in text_ext or p in {Path('Dockerfile'), Path('Caddyfile')}:
        texts[p] = b.decode(errors='replace')
    if p.suffix == '.json':
        try:
            json.loads(b)
        except (ValueError, UnicodeDecodeError):
            non_json.append(str(p))  # JSONC, etc.: not necessarily broken.
    if p.suffix == '.sh':
        shell.append(p)
        if subprocess.run(['bash', '-n', str(p)], capture_output=True).returncode:
            shell_errors.append(str(p))
    if p.parts[:2] == ('src', 'app') and p.name in {'route.ts', 'page.tsx', 'layout.tsx'}:
        url = '/' + '/'.join(x for x in p.parts[2:-1] if not x.startswith(('(', '@')))
        methods = re.findall(r'export\s+(?:async\s+function|const|let)\s+(GET|HEAD|OPTIONS|POST|PUT|PATCH|DELETE)\b', texts[p])
        routes.append((p, url, p.stem, ','.join(methods)))
        counts[p.stem] += 1
        counts['directly exported methods'] += len(methods)
        if p.stem != 'layout':
            urls.add(url)
    if p.parts[:2] == ('src', 'components') and p.suffix == '.tsx':
        counts['component tsx'] += 1
    if p.suffix == '.prisma':
        models[str(p)] = len(re.findall(r'^model ', texts[p], re.M))

dynamic_routes = [re.compile(re.sub(r'\\\[.*?\\\]', '[^/]+', re.escape(u))) for u in urls if '[' in u]
for p, t in texts.items():
    if (p.parts[0] in {'src', 'mini-services', 'scripts'} and '__tests__' not in p.parts
            and p.suffix in {'.ts', '.tsx', '.js', '.mjs'} and not p.name.endswith('.generated.ts')):
        for a, b in re.findall(r'''process\.env(?:\.([A-Z][A-Z0-9_]+)|\[['"]([A-Z][A-Z0-9_]+)['"]\])''', t):
            names[a or b].add(p)
    for n, line in enumerate(t.splitlines(), 1):
        for literal in sorted(set(re.findall(r'\b(?:TODO|FIXME)\b', line))):
            markers.append((p, n, literal))
    if p.suffix == '.md':
        for url in re.findall(r'\[[^\]\n]*\]\(([^()\s]+)\)', re.sub(r'```.*?```', '', t, flags=re.S)):
            url = unquote(re.split('[?#]', url)[0])
            if url and '://' not in url and not url.startswith(('#', 'mailto:', '/', '<', 'data:')) and not (p.parent / url).exists():
                links.append((p, url))
    if p.parts[0] == 'src' and p.suffix in {'.ts', '.tsx'} and '__tests__' not in p.parts:
        for attr, url in re.findall(r'''\b(href|src)=["'](/[^"'\s?#]*)["']''', t):
            if url in urls or Path('public' + url).is_file() or url.startswith('//') or any(r.fullmatch(url) for r in dynamic_routes):
                continue
            assets.append((p, attr, url))


def member(archive, name, stream):
    name = name.removeprefix('./').removeprefix('my-project/')
    with stream:
        h = hashlib.sha256()
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            h.update(block)
    current = files.get(Path(name))
    relation = 'same bytes' if h.hexdigest() == current else ('different bytes' if current else 'archive-only path')
    archive_rows.append((archive, name, relation))
    archive_counts[f'{archive.name}: {relation}'] += 1


for p in (p for p in present if p.parts[0] == 'download'):
    if p.suffix == '.zip':
        with zipfile.ZipFile(p) as z:
            for info in z.infolist():
                if not info.is_dir():
                    member(p, info.filename, z.open(info))
    elif p.name.endswith('.tar.gz'):
        with tarfile.open(p, mode='r:gz') as tar:
            for m in tar:
                if m.isfile():
                    member(p, m.name, tar.extractfile(m))


def declared(path):
    return set(re.findall(r'^\s*#?\s*([A-Z][A-Z0-9_]+)\s*=', Path(path).read_text(), re.M))


examples, production = declared('.env.example'), declared('deploy/env.production.example')
tsv('files', ('path', 'tracking', 'bytes', 'sha256'), ((p, 'tracked' if p in tracked else 'untracked', sizes[p], files[p]) for p in present))
tsv('routes', ('path', 'url', 'role', 'exported methods'), routes)
tsv('environment', ('name', 'root example', 'production example', 'literal usage files'),
    ((n, int(n in examples), int(n in production), ';'.join(map(str, sorted(names[n])))) for n in sorted(names)))
tsv('duplicates', ('sha256', 'path'), ((h, p) for h, ps in by_hash.items() if len(ps) > 1 for p in ps))
tsv('archive-members', ('archive', 'normalized member', 'relation to tree'), archive_rows)
tsv('markers', ('path', 'line', 'literal'), markers)
tsv('documentation-link-candidates', ('document', 'target'), links)
tsv('app-reference-candidates', ('source', 'attribute', 'path'), assets)
with (report_dir / 'before/files.tsv').open(newline='') as f:
    old = {Path(row['path']): row['sha256'] for row in csv.DictReader(f, delimiter='\t')}
changes = []
for p in sorted(old.keys() | files.keys()):
    if old.get(p) != files.get(p):
        status = 'added' if p not in old else ('removed' if p not in files else 'modified')
        changes.append((p, status, old.get(p, ''), files.get(p, '')))
tsv('changes-from-before', ('path', 'status', 'before sha256', 'after sha256'), changes)
summary = {
    'scope': 'git-listed tracked + nonignored new working-tree files; includes before/, excludes 02-after.md, tools/ and after/ of this audit',
    'tracked': len(tracked), 'paths': len(indexed), 'files_present': len(present), 'bytes': sum(sizes.values()),
    'directories_excluding_root': len(parents), 'empty_on_disk_nonignored': empty_directories(),
    'top': dict(sorted(Counter(p.parts[0] for p in present if len(p.parts) > 1).items())),
    'counts': dict(counts, **{'marker lines': len(markers), 'doc link candidates': len(links), 'app reference candidates': len(assets)}),
    'issues': {'missing': [str(p) for p in indexed if not p.exists()], 'symlinks_not_read': [str(p) for p in indexed if p.is_symlink()],
               'zero_bytes': [str(p) for p in present if not sizes[p]], 'non_strict_json': non_json, 'shell_parse': shell_errors},
    'duplicates': {'sets': sum(len(ps) > 1 for ps in by_hash.values()), 'paths': sum(len(ps) for ps in by_hash.values() if len(ps) > 1)},
    'env_names': len(names), 'env_not_in_either': len(names.keys() - examples - production), 'schema_models': models,
    'shell_parsed': len(shell), 'archives': archive_counts, 'changes_from_before': dict(Counter(row[1] for row in changes)),
}
(out / 'inventory.json').write_text(json.dumps(summary, indent=2) + '\n')
subprocess.run(['node', str(report_dir / 'tools/inspect-sources.mjs'), str(out)], check=True)
print(f'{len(present)} files hashed. Published metadata only in {out}.')
