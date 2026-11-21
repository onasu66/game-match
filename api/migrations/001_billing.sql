-- Premium billing columns + purchase ledger (idempotent-ish for D1 remote).
-- Run: npx wrangler d1 execute game-match-db --remote --file=./migrations/001_billing.sql

ALTER TABLE users ADD COLUMN premium_until TEXT;
ALTER TABLE users ADD COLUMN stripe_customer_id TEXT;

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
