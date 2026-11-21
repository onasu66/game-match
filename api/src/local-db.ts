import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { MatchDb } from "./types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const defaultDbPath = path.join(__dirname, "..", "data", "local.sqlite");

function migrateLocalSchema(sqlite: Database.Database) {
  const cols = sqlite.prepare("PRAGMA table_info(users)").all() as { name: string }[];
  const names = new Set(cols.map((c) => c.name));
  if (!names.has("premium_until")) {
    sqlite.exec("ALTER TABLE users ADD COLUMN premium_until TEXT");
  }
  if (!names.has("stripe_customer_id")) {
    sqlite.exec("ALTER TABLE users ADD COLUMN stripe_customer_id TEXT");
  }
  if (!names.has("points_balance")) {
    sqlite.exec(
      "ALTER TABLE users ADD COLUMN points_balance INTEGER NOT NULL DEFAULT 0",
    );
  }
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS purchases (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      provider TEXT NOT NULL,
      provider_ref TEXT NOT NULL UNIQUE,
      product TEXT NOT NULL,
      amount_jpy INTEGER,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
    CREATE INDEX IF NOT EXISTS idx_purchases_user ON purchases(user_id);
    CREATE TABLE IF NOT EXISTS point_ledger (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      delta INTEGER NOT NULL,
      balance_after INTEGER NOT NULL,
      reason TEXT NOT NULL,
      ref_id TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
    CREATE INDEX IF NOT EXISTS idx_point_ledger_user ON point_ledger(user_id);
    CREATE INDEX IF NOT EXISTS idx_point_ledger_user_created ON point_ledger(user_id, created_at);
  `);
}

export function openLocalDb(dbPath = process.env.DB_PATH || defaultDbPath): MatchDb {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const sqlite = new Database(dbPath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");

  const schemaPath = path.join(__dirname, "..", "schema.sql");
  sqlite.exec(fs.readFileSync(schemaPath, "utf8"));
  migrateLocalSchema(sqlite);

  return {
    async first<T>(sql: string, ...params: unknown[]) {
      const row = sqlite.prepare(sql).get(...params);
      return (row as T) ?? null;
    },
    async all<T>(sql: string, ...params: unknown[]) {
      return sqlite.prepare(sql).all(...params) as T[];
    },
    async run(sql: string, ...params: unknown[]) {
      const info = sqlite.prepare(sql).run(...params);
      return {
        success: true,
        meta: { changes: info.changes, last_row_id: Number(info.lastInsertRowid) },
      };
    },
  };
}
