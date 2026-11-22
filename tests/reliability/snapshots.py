"""Temporary filesystem only: retention, publication and dump credential boundary."""
import importlib.util
import os
from pathlib import Path
import shutil
import signal
import subprocess
import tempfile
import time
import unittest

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('publisher', ROOT / 'deploy/scripts/lib/publish-snapshot.py')
publisher = importlib.util.module_from_spec(spec)
spec.loader.exec_module(publisher)


class SnapshotTest(unittest.TestCase):
    def setUp(self):
        t = tempfile.TemporaryDirectory(); self.addCleanup(t.cleanup)
        self.root = Path(t.name); self.store = self.root / 'backups'; self.store.mkdir()
        self.app = self.root / 'app'; self.app.mkdir(); self.bin = self.root / 'bin'; self.bin.mkdir()
        # This fixture is a stand-in for the client binary, NOT a live MySQL restore.
        self.password = '!$#%&@:/fixture'
        self.url = 'mysql://user%40example:%21%24%23%25%26%40%3A%2Ffixture@localhost/test'
        (self.app / '.env').write_text('DATABASE_URL=' + self.url + '\n')
        self.mock('''import os,sys
opts=sys.stdin.read(); assert 'password="!$#%&@:/fixture"' in opts and 'user="user@example"' in opts
assert 'DATABASE_URL' not in os.environ and not any('fixture' in a or 'user@example' in a for a in sys.argv)
print('-- local dump test')''')

    def mock(self, body):
        p=self.bin/'mysqldump'; p.write_text('#!/usr/bin/env python3\n'+body+'\n'); p.chmod(0o700)

    def start(self):
        return subprocess.Popen(['bash',str(ROOT/'deploy/scripts/backup.sh')], env={'PATH':str(self.bin)+':'+os.environ['PATH'],'APP_DIR':str(self.app),'BACKUP_DIR':str(self.store)},stdout=subprocess.PIPE,stderr=subprocess.PIPE,start_new_session=True)

    def finish(self,p):
        out,err=p.communicate(timeout=20)
        for v in [self.password,self.url]: self.assertNotIn(v.encode(),out+err)
        return p.returncode

    def test_parallel_snapshots_are_private_and_verified(self):
        processes=[self.start(),self.start()]; self.assertEqual([self.finish(p) for p in processes],[0,0]); snapshots=list(self.store.iterdir()); self.assertEqual(len(snapshots),2)
        for snap in snapshots:
            self.assertTrue(publisher.verified(snap)); self.assertEqual(snap.stat().st_mode & 0o077,0)
            for f in snap.iterdir():
                self.assertEqual(f.stat().st_mode & 0o077,0); self.assertNotIn(self.password.encode(),f.read_bytes())

    def test_dump_error_and_invalid_url_leave_no_snapshot(self):
        self.mock("import sys;print('!$#%&@:/fixture',file=sys.stderr);sys.exit(2)")
        self.assertNotEqual(self.finish(self.start()),0); self.assertFalse(list(self.store.iterdir()))
        (self.app/'.env').write_text('DATABASE_URL=mysql://user:%zz@localhost/test');self.assertNotEqual(self.finish(self.start()),0); self.assertFalse(list(self.store.iterdir()))

    def test_interrupt(self):
        self.mock('import time;time.sleep(60)');p=self.start()
        for _ in range(100):
            if list(self.store.glob('.stage-*')): break
            time.sleep(.02)
        os.killpg(p.pid,signal.SIGTERM); self.assertNotEqual(self.finish(p),0); self.assertFalse(list(self.store.iterdir()))

    def test_retention_ignores_corrupt_and_incomplete_sets(self):
        self.assertEqual(self.finish(self.start()),0); original=next(self.store.iterdir()); old=time.time()-20*86400
        os.utime(original,(old,old))
        for i,change in enumerate(['database.sql.gz','manifest.json','SHA256SUMS','missing']):
            p=self.store/f'20200101T000000Z-bad{i}'; shutil.copytree(original,p)
            if change=='missing': (p/'database.sql.gz').unlink()
            else: (p/change).write_bytes(b'corrupt')
            self.assertFalse(publisher.verified(p));os.utime(p,(old,old))
        (self.store/'.stage-incomplete').mkdir();self.assertEqual(self.finish(self.start()),0);self.assertTrue(original.exists())
        for i in range(13):
            p=self.store/f'20260101T000000Z-good{i}'; shutil.copytree(original,p); os.utime(p,None)
        self.assertEqual(self.finish(self.start()),0); self.assertGreaterEqual(sum(publisher.verified(p) for p in self.store.iterdir()),14)
        self.assertFalse(original.exists());self.assertEqual(len(list(self.store.glob('*-bad*'))),4)


if __name__ == '__main__': unittest.main()
