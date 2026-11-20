import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { MatchDb } from "./types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const defaultDbPath = path.join(__dirname, "..", "data", "local.sqlite");

export function openLocalDb(dbPath = process.env.DB_PATH || defaultDbPath): MatchDb {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const sqlite = new Database(dbPath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");

  const schemaPath = path.join(__dirname, "..", "schema.sql");
  sqlite.exec(fs.readFileSync(schemaPath, "utf8"));

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
