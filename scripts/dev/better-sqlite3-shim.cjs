/**
 * Sandbox-only compatibility shim: implements the small `better-sqlite3`
 * surface used by `@prisma/adapter-better-sqlite3`, on top of Node's built-in
 * `node:sqlite` (Node >= 22.5).
 *
 * WHY THIS EXISTS
 * ---------------
 * `npm ci --ignore-scripts` cannot build the native `better-sqlite3` addon in
 * this sandbox (node-gyp needs to download Node headers, and nodejs.org is not
 * reachable). Prisma's SQLite driver adapter only calls:
 *
 *   new Database(path, opts)  db.prepare(sql).bind(args).run()/.all()/.columns()/.raw()
 *   db.exec(sql)  db.close()  db.defaultSafeIntegers(bool)
 *
 * This module provides exactly that surface so DB-backed verification
 * (workforce provisioning, provider configs, routing decisions) can run here.
 *
 * IT IS NOT PRODUCTION CODE. It is only activated when
 * `SANDBOX_SQLITE_SHIM=1` is set and `scripts/dev/register-sqlite-shim.cjs` is
 * preloaded. No application module imports it.
 */

'use strict'

const { DatabaseSync } = require('node:sqlite')

function normalise(value) {
  if (value === undefined || value === null) return null
  if (typeof value === 'boolean') return value ? 1 : 0
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'bigint') return Number(value)
  if (value instanceof ArrayBuffer) return new Uint8Array(value)
  return value
}

class SandboxStatement {
  constructor(db, sql) {
    this.db = db
    this.sql = sql
    this.args = []
    this.cached = null
  }

  bind(args) {
    this.args = (Array.isArray(args) ? args : [args]).map(normalise)
    return this
  }

  prepare() {
    if (!this.cached) this.cached = this.db.prepare(this.sql)
    return this.cached
  }

  get reader() {
    try {
      return this.prepare().columns().length > 0
    } catch {
      return false
    }
  }

  run() {
    const result = this.prepare().run(...this.args)
    return {
      changes: Number(result && result.changes ? result.changes : 0),
      lastInsertRowid: Number(result && result.lastInsertRowid ? result.lastInsertRowid : 0),
    }
  }

  get() {
    return this.prepare().get(...this.args)
  }

  all() {
    return this.prepare().all(...this.args)
  }

  columns() {
    try {
      return this.prepare()
        .columns()
        .map((column) => ({ name: column.name, type: column.type || null }))
    } catch {
      return []
    }
  }

  raw() {
    const order = () => this.columns().map((column) => column.name)
    return {
      all: () => {
        const names = order()
        return this.prepare()
          .all(...this.args)
          .map((row) => names.map((name) => (row[name] === undefined ? null : row[name])))
      },
      get: () => {
        const names = order()
        const row = this.prepare().get(...this.args)
        if (!row) return undefined
        return names.map((name) => (row[name] === undefined ? null : row[name]))
      },
    }
  }
}

class SandboxDatabase {
  constructor(path, options) {
    this.db = new DatabaseSync(path)
    const timeout = options && typeof options.timeout === 'number' ? options.timeout : 0
    if (timeout > 0) {
      try {
        this.db.exec(`PRAGMA busy_timeout = ${Math.trunc(timeout)}`)
      } catch {
        /* ignore */
      }
    }
  }

  prepare(sql) {
    return new SandboxStatement(this.db, sql)
  }

  exec(sql) {
    this.db.exec(sql)
    return this
  }

  pragma(statement) {
    try {
      return this.db.prepare(`PRAGMA ${statement}`).all()
    } catch {
      return undefined
    }
  }

  defaultSafeIntegers() {
    return this
  }

  transaction(fn) {
    return (...args) => {
      this.db.exec('BEGIN')
      try {
        const result = fn(...args)
        this.db.exec('COMMIT')
        return result
      } catch (error) {
        this.db.exec('ROLLBACK')
        throw error
      }
    }
  }

  close() {
    this.db.close()
    return this
  }
}

module.exports = SandboxDatabase
module.exports.default = SandboxDatabase
module.exports.Database = SandboxDatabase
