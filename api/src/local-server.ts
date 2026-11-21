import { serve } from "@hono/node-server";
import { createApp } from "./app.js";
import { readBillingConfigFromEnv } from "./billing.js";
import { openLocalDb } from "./local-db.js";
import { readLiveKitConfigFromEnv } from "./livekit.js";

const db = openLocalDb();
const jwtSecret = process.env.JWT_SECRET || "dev-change-me-in-production";
const port = Number(process.env.PORT || 8787);
const livekit = readLiveKitConfigFromEnv(process.env);
const publicBase = process.env.BILLING_PUBLIC_BASE || `http://127.0.0.1:${port}`;

const app = createApp({
  getDb: () => db,
  getJwtSecret: () => jwtSecret,
  getLiveKitConfig: () => livekit,
  getBillingConfig: () =>
    readBillingConfigFromEnv({
      STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
      STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
      STRIPE_PRICE_ID: process.env.STRIPE_PRICE_ID,
      BILLING_SUCCESS_URL: process.env.BILLING_SUCCESS_URL,
      BILLING_CANCEL_URL: process.env.BILLING_CANCEL_URL,
      ALLOW_MOCK_PURCHASE: process.env.ALLOW_MOCK_PURCHASE,
      BILLING_PUBLIC_BASE: publicBase,
    }),
});

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`game-match-api listening on http://127.0.0.1:${info.port}`);
  console.log("Auth: email + password (JWT)");
  console.log(
    livekit
      ? `LiveKit: configured (${livekit.url})`
      : "LiveKit: not configured (set LIVEKIT_API_KEY / LIVEKIT_API_SECRET)",
  );
  console.log("Billing: Stripe Checkout (mock purchase when Stripe unset)");
});
