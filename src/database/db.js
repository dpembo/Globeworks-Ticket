/**
 * SQLite via sql.js (pure WASM) — no native compilation.
 * Compatible enough with better-sqlite3 usage used in this project:
 *   db.prepare(sql).run(...params)
 *   db.prepare(sql).get(...params)
 *   db.prepare(sql).all(...params)
 *   db.exec(sql)
 *   db.transaction(fn)()
 *   result.lastInsertRowid
 */
const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(process.cwd(), 'data', 'globeworks.db');

let SQL = null;
let rawDb = null;
let wrapper = null;
let saveTimer = null;

function ensureDir() {
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function persist() {
  if (!rawDb) return;
  try {
    ensureDir();
    const data = rawDb.export();
    fs.writeFileSync(DB_PATH, Buffer.from(data));
  } catch (err) {
    console.error('[DB] Failed to persist:', err.message);
  }
}

function schedulePersist() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    persist();
  }, 250);
}

function convertParams(params) {
  // sql.js uses ? placeholders; values as array. Convert undefined → null.
  return params.map((p) => (p === undefined ? null : p));
}

class Statement {
  constructor(sql) {
    this.sql = sql;
  }

  run(...params) {
    const values = convertParams(params);
    rawDb.run(this.sql, values);
    schedulePersist();
    // last_insert_rowid after this statement
    const row = rawDb.exec('SELECT last_insert_rowid() AS id');
    const lastInsertRowid = row.length && row[0].values.length
      ? row[0].values[0][0]
      : 0;
    const changes = rawDb.getRowsModified();
    return { lastInsertRowid, changes };
  }

  get(...params) {
    const values = convertParams(params);
    const stmt = rawDb.prepare(this.sql);
    try {
      stmt.bind(values);
      if (stmt.step()) {
        return stmt.getAsObject();
      }
      return undefined;
    } finally {
      stmt.free();
    }
  }

  all(...params) {
    const values = convertParams(params);
    const stmt = rawDb.prepare(this.sql);
    const rows = [];
    try {
      stmt.bind(values);
      while (stmt.step()) {
        rows.push(stmt.getAsObject());
      }
      return rows;
    } finally {
      stmt.free();
    }
  }
}

class DbWrapper {
  prepare(sql) {
    return new Statement(sql);
  }

  exec(sql) {
    rawDb.exec(sql);
    schedulePersist();
  }

  pragma(pragmaSql) {
    // e.g. "journal_mode = WAL" or "foreign_keys = ON"
    // sql.js supports PRAGMA; WAL is not meaningful for in-memory export model but foreign_keys is.
    try {
      rawDb.run(`PRAGMA ${pragmaSql}`);
    } catch (_) {
      // ignore unsupported pragmas
    }
  }

  transaction(fn) {
    return (...args) => {
      rawDb.run('BEGIN');
      try {
        const result = fn(...args);
        rawDb.run('COMMIT');
        schedulePersist();
        return result;
      } catch (err) {
        try {
          rawDb.run('ROLLBACK');
        } catch (_) {}
        throw err;
      }
    };
  }

  close() {
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
    persist();
    if (rawDb) {
      rawDb.close();
      rawDb = null;
    }
    wrapper = null;
  }
}

/**
 * Must be called once at startup (async) before getDb().
 */
async function initDb() {
  if (wrapper) return wrapper;

  ensureDir();
  SQL = await initSqlJs({
    locateFile: (file) => path.join(process.cwd(), 'node_modules', 'sql.js', 'dist', file)
  });

  if (fs.existsSync(DB_PATH)) {
    const fileBuffer = fs.readFileSync(DB_PATH);
    rawDb = new SQL.Database(fileBuffer);
  } else {
    rawDb = new SQL.Database();
  }

  try {
    rawDb.run('PRAGMA foreign_keys = ON');
  } catch (_) {}

  wrapper = new DbWrapper();

  // Persist on process exit
  process.on('exit', () => {
    try {
      persist();
    } catch (_) {}
  });

  return wrapper;
}

function getDb() {
  if (!wrapper) {
    throw new Error('Database not initialized. Call await initDb() before getDb().');
  }
  return wrapper;
}

function closeDb() {
  if (wrapper) {
    wrapper.close();
  }
}

module.exports = { initDb, getDb, closeDb, DB_PATH };
