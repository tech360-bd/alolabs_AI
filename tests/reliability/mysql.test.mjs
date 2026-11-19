import test from 'node:test';
import assert from 'node:assert/strict';
import {dumpOptions} from '../../deploy/scripts/lib/mysql-dump.mjs';
test('reserved characters remain literal option values',()=>{
  const pass='!$#%&@:/`"\\';
  const {config,db}=dumpOptions(`mysql://a%40b:${encodeURIComponent(pass)}@localhost/test%20db?connection_limit=`);
  assert.equal(db,'test db');assert.ok(config.includes('user="a@b"\n'));assert.ok(config.includes('password="!$#%&@:/`\\"\\\\"\n'));
});
test('reject malformed URL, option-like database or newline',()=>{for(const u of ['broken','mysql://a@b/-x','mysql://a:%0a@b/d','mysql://a@b/d?sslaccept=strict'])assert.throws(()=>dumpOptions(u));});
