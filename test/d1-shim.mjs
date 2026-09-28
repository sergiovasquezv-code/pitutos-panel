import { DatabaseSync } from "node:sqlite";

// Emula la interfaz mínima de D1 (prepare().bind().all/first/run, exec)
// usando el módulo experimental node:sqlite, para poder probar la lógica
// de negocio de las Functions sin necesitar Wrangler/Miniflare.

class ShimStatement {
  constructor(db, sql, params = []) {
    this.db = db;
    this.sql = sql;
    this.params = params;
  }

  bind(...params) {
    return new ShimStatement(this.db, this.sql, params);
  }

  async all() {
    const rows = this.db.prepare(this.sql).all(...this.params);
    return { results: rows.map(plainRow), success: true, meta: {} };
  }

  async first(column) {
    const row = this.db.prepare(this.sql).get(...this.params);
    if (!row) return null;
    const plain = plainRow(row);
    return column ? plain[column] : plain;
  }

  async run() {
    const info = this.db.prepare(this.sql).run(...this.params);
    return {
      success: true,
      meta: {
        changes: info.changes,
        last_row_id: typeof info.lastInsertRowid === "bigint" ? Number(info.lastInsertRowid) : info.lastInsertRowid,
      },
    };
  }
}

function plainRow(row) {
  // node:sqlite entrega objetos con prototipo null; los normalizamos.
  return { ...row };
}

export class D1Shim {
  constructor(sqliteDb) {
    this.sqliteDb = sqliteDb;
  }

  prepare(sql) {
    return new ShimStatement(this.sqliteDb, sql);
  }

  async exec(sql) {
    this.sqliteDb.exec(sql);
  }

  async batch(stmts) {
    const out = [];
    for (const s of stmts) out.push(await s.run());
    return out;
  }
}

export function createD1(schemaSql) {
  const sqliteDb = new DatabaseSync(":memory:");
  sqliteDb.exec(schemaSql);
  return new D1Shim(sqliteDb);
}
