import { createApp } from "./app.js";
import { wrapD1 } from "./d1-db.js";

type Env = {
  DB: {
    prepare(query: string): {
      bind(...values: unknown[]): {
        first<T>(): Promise<T | null>;
        all<T>(): Promise<{ results: T[] }>;
        run(): Promise<{ success: boolean; meta: { changes: number; last_row_id: number } }>;
      };
    };
  };
  JWT_SECRET: string;
};

const app = createApp({
  getDb: (c) => wrapD1((c as { env: Env }).env.DB),
  getJwtSecret: (c) => (c as { env: Env }).env.JWT_SECRET || "dev-change-me-in-production",
});

export default app;
