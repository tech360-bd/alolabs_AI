"""Publish on the same POSIX filesystem and serialize retention (Linux/macOS)."""
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import sys
import time


def verified(path):
    try:
        manifest = json.loads((path / 'manifest.json').read_bytes())
        expected = {'commit.txt', 'manifest.json'}
        dumps = {'database.sqlite', 'database.sql.gz'} & {x.name for x in path.iterdir()}
        if len(dumps) != 1 or manifest['database_backup_verified'] is not True:
            return False
        expected.update(dumps)
        for flag, artifact in [('storage_included', 'application-storage.tar.gz'), ('external_storage_included', 'configured-storage.tar.gz')]:
            if type(manifest[flag]) is not bool:
                return False
            if manifest[flag]:
                expected.add(artifact)
        sums = dict(line.split('  ', 1)[::-1] for line in (path / 'SHA256SUMS').read_text().splitlines())
        if expected != sums.keys() or expected | {'SHA256SUMS'} != {x.name for x in path.iterdir()}:
            return False
        for name, digest in sums.items():
            artifact = path / name
            if artifact.is_symlink() or not artifact.is_file() or not artifact.stat().st_size:
                return False
            h = hashlib.sha256()
            with artifact.open('rb') as stream:
                for block in iter(lambda: stream.read(1024 * 1024), b''):
                    h.update(block)
            if h.hexdigest() != digest:
                return False
        return True
    except (OSError, KeyError, TypeError, ValueError):
        return False


def publish(stage, final):
    root = stage.parent
    if root != final.parent or not re.fullmatch(r'\d{8}T\d{6}Z-[A-Za-z0-9]+', final.name) or stage.name != '.stage-' + final.name or stage.is_symlink():
        raise ValueError('invalid snapshot path')
    fd = os.open(root, os.O_RDONLY)
    try:
        fcntl.flock(fd, fcntl.LOCK_EX)
        if final.exists() or not verified(stage):
            raise ValueError('snapshot verification failed')
        stage.rename(final)
        # Old-format, staging and invalid directories are neither counted nor deleted.
        valid = [p for p in root.iterdir() if re.fullmatch(r'\d{8}T\d{6}Z-[A-Za-z0-9]+', p.name) and not p.is_symlink() and p.is_dir() and verified(p)]
        valid.sort(key=lambda p: p.stat().st_mtime, reverse=True)
        for p in valid[14:]:
            if p != final and time.time() - p.stat().st_mtime > 15 * 86400:
                shutil.rmtree(p)
    finally:
        os.close(fd)


if __name__ == '__main__':
    publish(*map(Path, sys.argv[1:]))
