import type { MatchDb } from "./types.js";

type D1DatabaseLike = {
  prepare(query: string): {
    bind(...values: unknown[]): {
      first<T>(): Promise<T | null>;
      all<T>(): Promise<{ results: T[] }>;
      run(): Promise<{ success: boolean; meta: { changes: number; last_row_id: number } }>;
    };
  };
};

export function wrapD1(db: D1DatabaseLike): MatchDb {
  return {
    async first<T>(sql: string, ...params: unknown[]) {
      return db.prepare(sql).bind(...params).first<T>();
    },
    async all<T>(sql: string, ...params: unknown[]) {
      const res = await db.prepare(sql).bind(...params).all<T>();
      return res.results ?? [];
    },
    async run(sql: string, ...params: unknown[]) {
      return db.prepare(sql).bind(...params).run();
    },
  };
}
