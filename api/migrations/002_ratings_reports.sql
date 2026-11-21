-- Ratings + reports (idempotent-ish for D1 remote).
-- Run: npx wrangler d1 execute game-match-db --remote --file=./migrations/002_ratings_reports.sql

CREATE TABLE IF NOT EXISTS ratings (
  id TEXT PRIMARY KEY,
  listing_id TEXT NOT NULL,
  from_user_id TEXT NOT NULL,
  to_user_id TEXT NOT NULL,
  score INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (listing_id, from_user_id, to_user_id),
  FOREIGN KEY (listing_id) REFERENCES listings(id),
  FOREIGN KEY (from_user_id) REFERENCES users(id),
  FOREIGN KEY (to_user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY,
  listing_id TEXT,
  reporter_id TEXT NOT NULL,
  reported_user_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  comment TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  UNIQUE (listing_id, reporter_id, reported_user_id),
  FOREIGN KEY (listing_id) REFERENCES listings(id),
  FOREIGN KEY (reporter_id) REFERENCES users(id),
  FOREIGN KEY (reported_user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_ratings_to_user ON ratings(to_user_id);
CREATE INDEX IF NOT EXISTS idx_ratings_listing ON ratings(listing_id);
CREATE INDEX IF NOT EXISTS idx_reports_reported ON reports(reported_user_id);
