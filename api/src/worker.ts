import { createApp } from "./app.js";
import { readBillingConfigFromEnv } from "./billing.js";
import { wrapD1 } from "./d1-db.js";
import { readLiveKitConfigFromEnv } from "./livekit.js";

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
  LIVEKIT_URL?: string;
  LIVEKIT_API_KEY?: string;
  LIVEKIT_API_SECRET?: string;
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  STRIPE_PRICE_ID?: string;
  BILLING_SUCCESS_URL?: string;
  BILLING_CANCEL_URL?: string;
  ALLOW_MOCK_PURCHASE?: string;
  BILLING_PUBLIC_BASE?: string;
};

const app = createApp({
  getDb: (c) => wrapD1((c as { env: Env }).env.DB),
  getJwtSecret: (c) =>
    (c as { env: Env }).env.JWT_SECRET || "dev-change-me-in-production",
  getLiveKitConfig: (c) => readLiveKitConfigFromEnv((c as { env: Env }).env),
  getBillingConfig: (c) =>
    readBillingConfigFromEnv({
      ...(c as { env: Env }).env,
      BILLING_PUBLIC_BASE:
        (c as { env: Env }).env.BILLING_PUBLIC_BASE ||
        "https://game-match-api.0v09979.workers.dev",
    }),
});

export default app;
