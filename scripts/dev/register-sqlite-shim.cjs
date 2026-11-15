/**
 * Sandbox-only preload: route `require('better-sqlite3')` to the node:sqlite
 * shim when `SANDBOX_SQLITE_SHIM=1`.
 *
 * Usage (never in production):
 *   SANDBOX_SQLITE_SHIM=1 node -r ./scripts/dev/register-sqlite-shim.cjs script.js
 *   SANDBOX_SQLITE_SHIM=1 NODE_OPTIONS="-r ./scripts/dev/register-sqlite-shim.cjs" npx tsx ...
 */

'use strict'

if (process.env.SANDBOX_SQLITE_SHIM === '1') {
  const Module = require('node:module')
  const path = require('node:path')
  const originalLoad = Module._load

  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === 'better-sqlite3') {
      return originalLoad.call(this, path.join(__dirname, 'better-sqlite3-shim.cjs'), parent, isMain)
    }
    return originalLoad.call(this, request, parent, isMain)
  }
}
