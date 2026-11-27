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
        if manifest.get('commit') != (path / 'commit.txt').read_text().strip() or manifest.get('checksum_manifest') != 'SHA256SUMS':
            return False
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
        # Retention keeps the newest RETAIN_COUNT snapshots and additionally
        # drops ones older than RETAIN_MAX_AGE_DAYS — but a snapshot is deleted
        # only when it exceeds BOTH bounds. Deleting on either bound alone is
        # unsafe: with a single valid snapshot present (a fresh host, or after a
        # run of failed backups) the age bound would delete the ONLY restorable
        # copy. tests/reliability/snapshots.py pins that guarantee.
        #
        # The previous 14/15-day pair kept two weeks of full copies, which can
        # fill a shared 520 GB disk. 7/7 is the default and is overridable per
        # host (docs/SERVER_CAPACITY_PLAN.md §4).
        retain_count = int(os.environ.get('ALO_BACKUP_RETAIN_COUNT', '7'))
        retain_max_age = int(os.environ.get('ALO_BACKUP_RETAIN_DAYS', '7')) * 86400
        valid.sort(key=lambda p: p.stat().st_mtime, reverse=True)
        for index, p in enumerate(valid):
            if p == final:
                continue
            too_many = index >= retain_count
            too_old = time.time() - p.stat().st_mtime > retain_max_age
            # Never leave fewer than retain_count restorable snapshots behind.
            if too_many and too_old and len(valid) - 1 >= retain_count:
                shutil.rmtree(p)
    finally:
        os.close(fd)


if __name__ == '__main__':
    publish(*map(Path, sys.argv[1:]))
