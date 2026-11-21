export type UserRow = {
  id: string;
  email: string;
  password_hash: string;
  display_name: string;
  birth_date: string;
  favorite_games: string;
  created_at: string;
  premium_until?: string | null;
  stripe_customer_id?: string | null;
};

export type PurchaseRow = {
  id: string;
  user_id: string;
  provider: string;
  provider_ref: string;
  product: string;
  amount_jpy: number | null;
  status: string;
  created_at: string;
};

export type ListingRow = {
  id: string;
  host_id: string;
  game: string;
  rank_note: string;
  slots: number;
  description: string;
  voice_optional: number;
  status: string;
  created_at: string;
};

export type MembershipRow = {
  listing_id: string;
  user_id: string;
  joined_at: string;
};

export type RatingRow = {
  id: string;
  listing_id: string;
  from_user_id: string;
  to_user_id: string;
  score: number;
  created_at: string;
};

export type ReportRow = {
  id: string;
  listing_id: string | null;
  reporter_id: string;
  reported_user_id: string;
  reason: string;
  comment: string;
  created_at: string;
};

/** Fixed report reasons (client + server share labels via API). */
export const REPORT_REASONS = [
  "harassment",
  "cheating",
  "spam",
  "inappropriate",
  "other",
] as const;

export type ReportReason = (typeof REPORT_REASONS)[number];

export function isValidReportReason(value: string): value is ReportReason {
  return (REPORT_REASONS as readonly string[]).includes(value);
}

export type DbExecResult = {
  success: boolean;
  meta?: { changes?: number; last_row_id?: number };
};

export interface MatchDb {
  first<T>(sql: string, ...params: unknown[]): Promise<T | null>;
  all<T>(sql: string, ...params: unknown[]): Promise<T[]>;
  run(sql: string, ...params: unknown[]): Promise<DbExecResult>;
}
