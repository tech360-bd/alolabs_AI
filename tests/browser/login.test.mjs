import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, createHmac } from 'node:crypto';
import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:net';
import { DatabaseSync } from 'node:sqlite';
import bcrypt from 'bcrypt';
import { chromium } from 'playwright';

const cwd = fileURLToPath(new URL('../../', import.meta.url));
const password = randomBytes(24).toString('hex'), secret = randomBytes(20);
let temp, db, browser, app, origin;
function otp(slot) {
  const b = Buffer.alloc(8); b.writeBigUInt64BE(BigInt(slot));
  const h = createHmac('sha1',secret).update(b).digest();
  return String((h.readUInt32BE(h[19]&15) & 0x7fffffff)%1000000).padStart(6,'0');
}
before(async () => {
  assert.ok(!readdirSync(cwd).some(n => /^\.env(?:$|\.local$|\.development(?:\.local)?$)/.test(n)), 'Use a clean checkout without runtime dotenv files');
  temp=mkdtempSync(join(tmpdir(),'alo-browser-'));
  const path=join(temp,'test.sqlite');
  const env={PATH:process.env.PATH,HOME:temp,NEXT_TELEMETRY_DISABLED:'1',NODE_ENV:'development',DATABASE_URL:`file:${path}`,PRISMA_SQLITE_ADAPTER:'1',JWT_SECRET:randomBytes(32).toString('hex')};
  execFileSync('npm',['run','db:push:sqlite'],{cwd,env,stdio:'ignore'});
  db=new DatabaseSync(path);
  for(const [id,mfa] of [['staff',0],['mfa',1]]) db.prepare('INSERT INTO User(id,email,name,passwordHash,role,otpSecret,otpEnabled,updatedAt) VALUES(?,?,?,?,?,?,?,CURRENT_TIMESTAMP)').run(id,`${id}@example.test`,id,await bcrypt.hash(password,10),'account_manager',mfa?secret.toString('hex'):null,mfa);
  browser=await chromium.launch({executablePath:process.env.TEST_CHROMIUM_PATH || undefined});
  const sock=createServer(); await new Promise(r=>sock.listen(0,'127.0.0.1',r)); const port=sock.address().port; await new Promise(r=>sock.close(r));
  origin=`http://127.0.0.1:${port}`;
  app=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','--hostname','127.0.0.1','-p',String(port)],{cwd,env,detached:true,stdio:'ignore'});
  for(let i=0;i<120;i++) {assert.equal(app.exitCode,null,'isolated dev server exited');try {if((await fetch(origin+'/login')).ok)return;} catch {} await new Promise(r=>setTimeout(r,500));}
  throw Error('isolated login page did not start');
});
after(async()=>{if(app?.pid){try{process.kill(-app.pid,'SIGTERM');}catch{}} await browser?.close();db?.close();if(temp)rmSync(temp,{recursive:true,force:true});});
async function session(t) {
  const ctx=await browser.newContext({baseURL:origin});t.after(()=>ctx.close());
  const page=await ctx.newPage();page.setDefaultTimeout(60000);
  await page.goto('/login'); return {page,ctx};
}
async function signIn(page,id,pass=password) {
  await page.locator('#login-email').fill(`${id}@example.test`);await page.locator('#login-password').fill(pass);await page.locator('button[type=submit]').click();
}
async function persisted(page,ctx) {
  await page.waitForURL('**/dashboard');await page.reload();assert.equal(new URL(page.url()).pathname,'/dashboard');
  const cookie=(await ctx.cookies()).find(c=>c.name==='session-token');assert.ok(cookie?.httpOnly && cookie.path==='/' && cookie.sameSite==='Lax');
  assert.equal((await ctx.request.get('/api/auth/me',{headers:{authorization:`Bearer ${cookie.value}`}})).status(),200);return cookie.value;
}
test('normal login survives reload; server denies privileged API and revokes session on logout',async t=>{
  const {page,ctx}=await session(t);await signIn(page,'staff');const token=await persisted(page,ctx);
  const headers={authorization:`Bearer ${token}`};assert.equal((await ctx.request.get('/api/users',{headers})).status(),403);
  assert.equal((await ctx.request.post('/api/auth/logout',{headers})).status(),200);
  assert.equal((await ctx.request.get('/api/auth/me',{headers})).status(),401);
  await page.goto('/dashboard');await page.waitForURL('**/login**');
});
test('invalid login cannot open protected dashboard',async t=>{
  const {page,ctx}=await session(t);await signIn(page,'staff','not-the-test-password');await page.getByText('Invalid email or password',{exact:true}).waitFor();
  assert.ok(!(await ctx.cookies()).some(c=>c.name==='session-token'));await page.goto('/dashboard');await page.waitForURL('**/login**');
});
test('MFA blocks access until valid TOTP; expired persisted session is denied',async t=>{
  const {page,ctx}=await session(t);await signIn(page,'mfa');const code=page.getByPlaceholder('000 000');await code.waitFor();
  assert.equal((await ctx.request.get('/api/auth/me')).status(),401);
  const slot=Math.floor(Date.now()/30000);let invalid='000000';while([slot-1,slot,slot+1].map(otp).includes(invalid))invalid=String(Number(invalid)+1).padStart(6,'0');
  await code.fill(invalid);const button=page.getByRole('button',{name:'Verify Code'});
  const [denied]=await Promise.all([page.waitForResponse(r=>r.url().endsWith('/api/auth/mfa/verify')),button.click()]);assert.ok(denied.status()>=400 && denied.status()<500);assert.equal((await ctx.request.get('/api/auth/me')).status(),401);
  await page.getByRole('button',{name:'Try Again'}).click();await signIn(page,'mfa');
  await code.fill(otp(Math.floor(Date.now()/30000)));await button.click();const token=await persisted(page,ctx);
  db.prepare('UPDATE Session SET expiresAt=0 WHERE userId=?').run('mfa');assert.equal((await ctx.request.get('/api/auth/me',{headers:{authorization:`Bearer ${token}`}})).status(),401);await page.goto('/dashboard');await page.waitForURL('**/login**');
});
