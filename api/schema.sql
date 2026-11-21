CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  display_name TEXT NOT NULL,
  birth_date TEXT NOT NULL,
  favorite_games TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  premium_until TEXT,
  stripe_customer_id TEXT,
  points_balance INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS listings (
  id TEXT PRIMARY KEY,
  host_id TEXT NOT NULL,
  game TEXT NOT NULL,
  rank_note TEXT NOT NULL DEFAULT '',
  slots INTEGER NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  voice_optional INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TEXT NOT NULL,
  FOREIGN KEY (host_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS memberships (
  listing_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  joined_at TEXT NOT NULL,
  PRIMARY KEY (listing_id, user_id),
  FOREIGN KEY (listing_id) REFERENCES listings(id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

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

CREATE INDEX IF NOT EXISTS idx_listings_game ON listings(game);
CREATE INDEX IF NOT EXISTS idx_listings_status ON listings(status);
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

CREATE INDEX IF NOT EXISTS idx_purchases_user ON purchases(user_id);
CREATE INDEX IF NOT EXISTS idx_point_ledger_user ON point_ledger(user_id);
CREATE INDEX IF NOT EXISTS idx_point_ledger_user_created ON point_ledger(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_ratings_to_user ON ratings(to_user_id);
CREATE INDEX IF NOT EXISTS idx_ratings_listing ON ratings(listing_id);
CREATE INDEX IF NOT EXISTS idx_reports_reported ON reports(reported_user_id);
