-- Points balance + ledger (idempotent-ish for D1 remote).
-- Run: npx wrangler d1 execute game-match-db --remote --file=./migrations/003_points.sql

ALTER TABLE users ADD COLUMN points_balance INTEGER NOT NULL DEFAULT 0;

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
