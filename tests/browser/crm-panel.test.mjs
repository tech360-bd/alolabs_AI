/**
 * CRM Connections panel — real browser regression.
 *
 * Proves the dashboard view of the new CRM workflow renders from the database
 * (empty state here) and that no credential material reaches the DOM. It does
 * NOT prove an external CRM or AI provider call; those are covered by the
 * integration test plus the (currently BLOCKED) staging E2E.
 */
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, openSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:net';
import { DatabaseSync } from 'node:sqlite';
import { chromium } from 'playwright';
// Repository root, independent of the machine the test runs on.
const cwd=resolve(dirname(fileURLToPath(import.meta.url)),'..','..');
const password=randomBytes(24).toString('hex');
let temp, db, browser, app, origin;
before(async () => {
  temp=mkdtempSync(join(tmpdir(),'alo-crm-ui-')); const path=join(temp,'test.sqlite');
  const env={PATH:process.env.PATH,HOME:temp,NEXT_TELEMETRY_DISABLED:'1',NODE_ENV:'development',DATABASE_URL:`file:${path}`,PRISMA_SQLITE_ADAPTER:'1',JWT_SECRET:randomBytes(32).toString('hex')};
  execFileSync('npm',['run','db:push:sqlite'],{cwd,env,stdio:'ignore'});
  execFileSync('npm',['run','seed:agentos'],{cwd,env:{...env,SEED_ADMIN_EMAIL:'ui@example.test',SEED_ADMIN_PASSWORD:password},stdio:'ignore'});
  browser=await chromium.launch({executablePath:process.env.TEST_CHROMIUM_PATH || undefined});
  // Next dev can exit transiently right after startup (stale dev lock / port
  // race). Retry once, and surface its log instead of an opaque assertion.
  let lastError = '';
  for (let attempt = 1; attempt <= 2; attempt++) {
    const sock=createServer(); await new Promise(r=>sock.listen(0,'127.0.0.1',r)); const port=sock.address().port; await new Promise(r=>sock.close(r));
    origin=`http://127.0.0.1:${port}`;
    const logPath=join(temp,`next-${attempt}.log`); const fd=openSync(logPath,'a');
    app=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','--hostname','127.0.0.1','-p',String(port)],{cwd,env,detached:true,stdio:['ignore',fd,fd]});
    let ready=false;
    for(let i=0;i<180;i++){
      if(app.exitCode!==null){ lastError=readFileSync(logPath,'utf8').slice(-800); break; }
      try{if((await fetch(origin+'/login')).ok){ready=true;break;}}catch{}
      await new Promise(r=>setTimeout(r,500));
    }
    if(ready) return;
    try{process.kill(-app.pid,'SIGTERM');}catch{}
    await new Promise(r=>setTimeout(r,1500));
  }
  throw Error(`isolated dev server did not start: ${lastError || 'no log'}`);
});
after(async()=>{if(app?.pid){try{process.kill(-app.pid,'SIGTERM');}catch{}} await browser?.close();db?.close();if(temp)rmSync(temp,{recursive:true,force:true});});
test('CRM Connections panel renders real empty state without leaking secrets', async () => {
  const ctx=await browser.newContext({baseURL:origin}); const page=await ctx.newPage(); page.setDefaultTimeout(90000);
  await page.goto('/login');
  await page.locator('#login-email').fill('ui@example.test'); await page.locator('#login-password').fill(password);
  await page.locator('button[type=submit]').click(); await page.waitForURL('**/dashboard');
  await page.getByRole('button',{name:/CRM Connections/i}).first().click();
  await page.getByRole('heading',{name:'CRM Connections'}).waitFor();
  await page.getByText(/No CRM connection is stored for this tenant/i).waitFor();
  await page.getByText(/No follow-up run yet/i).waitFor();
  await page.getByRole('heading', { name: 'Staging readiness' }).waitFor();
  await page.getByText(/AI provider/i).first().waitFor();
  await page.getByText(/execution: BLOCKED/i).first().waitFor();
  await page.getByText(/preflight: ok/i).first().waitFor();
  const html=await page.content(); assert.ok(!/Bearer|apiKey|secret/i.test(html.replace(/read-only API key/gi,'')),'no credential material in DOM');
  await ctx.close();
});
