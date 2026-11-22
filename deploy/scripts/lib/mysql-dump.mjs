// Private option pipe, not an argv password, shell script, or temporary file.
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export function dumpOptions(raw) {
  const u = new URL(raw);
  const db = decodeURIComponent(u.pathname.slice(1));
  if (!['mysql:', 'mariadb:'].includes(u.protocol) || !u.hostname || !u.username || !db || db.startsWith('-') || u.hash) throw Error('Invalid database configuration');
  // Never silently ignore TLS, socket or other connection policy settings.
  if ([...u.searchParams.keys()].some(k => !['connection_limit','pool_timeout','connect_timeout'].includes(k))) throw Error('Unsupported dump URL parameter');
  function quote(value) {
    if (/[\x00-\x1f\x7f]/u.test(value)) throw Error('Unsupported control character');
    return '"' + value.replace(/[\\"]/g, '\\$&') + '"';
  }
  const opts = {host:u.hostname.replace(/^\[|\]$/g,''), port:u.port || '3306', user:decodeURIComponent(u.username), password:decodeURIComponent(u.password)};
  return {db, config:'[client]\n'+Object.entries(opts).map(([k,v])=>`${k}=${quote(v)}\n`).join('')};
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const {db,config} = dumpOptions(process.env.DATABASE_URL);
    // Shell supplies an OS pipe for fd 0 (Node's child stdio pipe can be a socket).
    if (process.argv[2] === 'options') process.stdout.write(config);
    else {
      const child = spawn('mysqldump', ['--defaults-file=/dev/stdin','--protocol=TCP','--single-transaction','--routines','--triggers','--',db], {env:{PATH:process.env.PATH},stdio:['inherit','inherit','ignore']});
      child.on('error',()=>{process.exitCode=1;});
      child.on('close',code=>{if(code!==0){console.error('Database dump failed');process.exitCode=1;}});
    }
  } catch { console.error('Invalid database dump configuration'); process.exitCode=1; }
}
